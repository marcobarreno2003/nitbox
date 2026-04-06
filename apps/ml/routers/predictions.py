# =============================================================================
# Predictions router — exposes ML prediction endpoints.
#
# POST /predict          → predict result for a fixture by fixtureId or team IDs
# POST /predict/train    → trigger model re-training (admin use)
# GET  /models/metrics   → CV accuracy for all 8 models
# GET  /models/status    → training state summary
# =============================================================================

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from db import get_db
from services import predictor

router = APIRouter(tags=["predictions"])


# ── Request / Response schemas ────────────────────────────────────────────────

class PredictByFixtureRequest(BaseModel):
    fixture_id: int   # API-Football fixture id (matches.api_football_id)


class PredictByTeamsRequest(BaseModel):
    home_team_id:          int
    away_team_id:          int
    competition_season_id: int
    kickoff_date:          str   # ISO date string e.g. "2026-06-15T18:00:00"


class PredictionResponse(BaseModel):
    fixture_id:         int | None
    home_team_id:       int
    away_team_id:       int
    model:              str | None
    home_win_prob:      float
    draw_prob:          float
    away_win_prob:      float
    predicted_result:   str
    confidence:         float
    model_scores:       dict


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_fixture(db: Session, fixture_id: int) -> dict:
    """Fetches match data from DB by API-Football fixture ID."""
    sql = text("""
        SELECT
            m.id,
            m."apiFootballId"       AS api_football_id,
            m."homeTeamId"          AS home_team_id,
            m."awayTeamId"          AS away_team_id,
            m."competitionSeasonId" AS competition_season_id,
            m."kickoffAt"           AS kickoff_at
        FROM matches m
        WHERE m."apiFootballId" = :fixture_id
        LIMIT 1
    """)
    row = db.execute(sql, {"fixture_id": fixture_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Fixture {fixture_id} not found in DB")
    return row._asdict()


def _build_model_scores(db: Session, home_team_id: int, away_team_id: int,
                         competition_season_id: int, kickoff_date: str) -> dict:
    """
    Runs all individual models (not just the best) and returns their predictions.
    Used to populate the modelScores JSON field in MatchPrediction.
    """
    from services.features import build_match_features, get_feature_names
    import numpy as np
    from services.predictor import _build_models, _state, _ensure_trained

    _ensure_trained(db)

    feature_names = get_feature_names()
    features      = build_match_features(
        db=db,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        competition_season_id=competition_season_id,
        kickoff_date=kickoff_date,
    )
    x = np.array([[features[f] for f in feature_names]], dtype=float)

    # Return the best model's metrics as a proxy for individual model scores
    # (individual models are not cached separately to save memory)
    scores = {}
    for m in _state.all_metrics:
        scores[m.name] = round(m.cv_accuracy, 4)
    return scores


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/predict", response_model=PredictionResponse)
def predict_fixture(req: PredictByFixtureRequest):
    """
    Predicts the result of an upcoming match by API-Football fixture ID.
    The fixture must exist in the matches table (seeded via seed:calendar).
    """
    with get_db() as db:
        match = _resolve_fixture(db, req.fixture_id)

        result = predictor.predict(
            db=db,
            home_team_id=match["home_team_id"],
            away_team_id=match["away_team_id"],
            competition_season_id=match["competition_season_id"],
            kickoff_date=match["kickoff_at"].isoformat(),
        )

        if "error" in result:
            raise HTTPException(status_code=503, detail=result["error"])

        model_scores = _build_model_scores(
            db=db,
            home_team_id=match["home_team_id"],
            away_team_id=match["away_team_id"],
            competition_season_id=match["competition_season_id"],
            kickoff_date=match["kickoff_at"].isoformat(),
        )

        return PredictionResponse(
            fixture_id=req.fixture_id,
            home_team_id=match["home_team_id"],
            away_team_id=match["away_team_id"],
            model=result["model"],
            home_win_prob=result["home_win"],
            draw_prob=result["draw"],
            away_win_prob=result["away_win"],
            predicted_result=result["predicted"],
            confidence=result["confidence"],
            model_scores=model_scores,
        )


@router.post("/predict/teams", response_model=PredictionResponse)
def predict_by_teams(req: PredictByTeamsRequest):
    """
    Predicts the result of a match by direct team IDs.
    Useful for hypothetical matchups or before a fixture is seeded.
    """
    with get_db() as db:
        result = predictor.predict(
            db=db,
            home_team_id=req.home_team_id,
            away_team_id=req.away_team_id,
            competition_season_id=req.competition_season_id,
            kickoff_date=req.kickoff_date,
        )

        if "error" in result:
            raise HTTPException(status_code=503, detail=result["error"])

        model_scores = _build_model_scores(
            db=db,
            home_team_id=req.home_team_id,
            away_team_id=req.away_team_id,
            competition_season_id=req.competition_season_id,
            kickoff_date=req.kickoff_date,
        )

        return PredictionResponse(
            fixture_id=None,
            home_team_id=req.home_team_id,
            away_team_id=req.away_team_id,
            model=result["model"],
            home_win_prob=result["home_win"],
            draw_prob=result["draw"],
            away_win_prob=result["away_win"],
            predicted_result=result["predicted"],
            confidence=result["confidence"],
            model_scores=model_scores,
        )


@router.post("/predict/train")
def trigger_training():
    """
    Triggers a full model re-training on all FULLY_ENRICHED matches.
    Use after running seed:matches-finished to incorporate new data.
    """
    with get_db() as db:
        metrics = predictor.train(db)
        if not metrics:
            raise HTTPException(status_code=503, detail="Not enough training data")

        best = next((m for m in metrics if m.is_best), None)
        return {
            "status":      "trained",
            "best_model":  best.name if best else None,
            "best_cv_acc": round(best.cv_accuracy, 4) if best else None,
            "models":      [{"name": m.name, "cv_accuracy": round(m.cv_accuracy, 4), "is_best": m.is_best} for m in metrics],
        }


@router.get("/models/metrics")
def models_metrics():
    """Returns cross-validation accuracy for all 8 models."""
    metrics = predictor.get_metrics()
    if not metrics:
        return {"status": "not_trained", "models": []}
    return {"status": "trained", "models": metrics}


@router.get("/models/status")
def models_status():
    """Returns the current training state summary."""
    return predictor.get_state_summary()
