# =============================================================================
# Predictor — trains 8 ML models on historical match data and exposes
#             predict() for upcoming matches.
#
# Models:
#   1. Logistic Regression
#   2. K-Nearest Neighbors
#   3. Random Forest
#   4. Gradient Boosting
#   5. Support Vector Machine
#   6. Naive Bayes
#   7. Multi-Layer Perceptron
#   8. Voting Ensemble (hard vote of all above)
#
# Training:
#   - Label: 0=HOME win, 1=DRAW, 2=AWAY win
#   - 5-fold stratified cross-validation to select best model
#   - Best model by balanced accuracy (handles class imbalance)
#   - Model is retrained on full dataset after selection
#
# Lifecycle:
#   - Models are trained lazily on first predict() call
#   - Re-training triggered by calling train() explicitly
#   - Metrics cached in memory, exposed via get_metrics()
# =============================================================================

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import (
    GradientBoostingClassifier,
    RandomForestClassifier,
    VotingClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from services.features import build_match_features, get_feature_names

logger = logging.getLogger(__name__)

LABEL_MAP     = {0: "HOME", 1: "DRAW", 2: "AWAY"}
LABEL_MAP_INV = {"HOME": 0, "DRAW": 1, "AWAY": 2}
MIN_TRAINING_SAMPLES = 30  # minimum matches needed to train


@dataclass
class ModelMetrics:
    name:          str
    cv_accuracy:   float
    cv_std:        float
    is_best:       bool = False


@dataclass
class PredictorState:
    best_model:     Optional[object]       = None
    best_model_name: str                   = ""
    all_metrics:    list[ModelMetrics]     = field(default_factory=list)
    trained:        bool                   = False
    training_samples: int                  = 0


_state     = PredictorState()
_lock      = threading.Lock()


# ── Model definitions ─────────────────────────────────────────────────────────

def _build_models() -> dict[str, object]:
    """Returns a dict of model_name → sklearn Pipeline (with scaler)."""
    base_models = {
        "logistic_regression": LogisticRegression(
            max_iter=1000, multi_class="multinomial", C=1.0, random_state=42
        ),
        "knn": KNeighborsClassifier(n_neighbors=7, weights="distance"),
        "random_forest": RandomForestClassifier(
            n_estimators=200, max_depth=6, random_state=42, class_weight="balanced"
        ),
        "gradient_boosting": GradientBoostingClassifier(
            n_estimators=200, learning_rate=0.05, max_depth=4, random_state=42
        ),
        "svm": CalibratedClassifierCV(
            SVC(kernel="rbf", C=1.0, gamma="scale", probability=False, random_state=42)
        ),
        "naive_bayes": GaussianNB(),
        "mlp": MLPClassifier(
            hidden_layer_sizes=(64, 32),
            activation="relu",
            max_iter=500,
            random_state=42,
            early_stopping=True,
        ),
    }

    # Voting ensemble uses all base models
    voting = VotingClassifier(
        estimators=[(name, model) for name, model in base_models.items()],
        voting="soft",
    )
    base_models["ensemble"] = voting

    # Wrap everything in a Pipeline with StandardScaler
    return {
        name: Pipeline([("scaler", StandardScaler()), ("clf", model)])
        for name, model in base_models.items()
    }


# ── Training data loader ──────────────────────────────────────────────────────

def _load_training_data(db: Session) -> tuple[np.ndarray, np.ndarray]:
    """
    Loads all FULLY_ENRICHED finished matches from DB and builds
    (X, y) arrays for training.
    """
    sql = text("""
        SELECT
            m.id,
            m."homeTeamId"          AS home_team_id,
            m."awayTeamId"          AS away_team_id,
            m."competitionSeasonId" AS competition_season_id,
            m."kickoffAt"           AS kickoff_at,
            m."homeScore"           AS home_score,
            m."awayScore"           AS away_score
        FROM matches m
        WHERE
            m."statusShort"  IN ('FT', 'AET', 'PEN')
            AND m."enrichStatus" = 'FULLY_ENRICHED'
            AND m."homeScore" IS NOT NULL
            AND m."awayScore" IS NOT NULL
        ORDER BY m."kickoffAt" ASC
    """)

    rows = db.execute(sql).fetchall()
    logger.info(f"Training data: {len(rows)} matches")

    feature_names = get_feature_names()
    X_rows = []
    y_rows = []

    for row in rows:
        try:
            features = build_match_features(
                db=db,
                home_team_id=row.home_team_id,
                away_team_id=row.away_team_id,
                competition_season_id=row.competition_season_id,
                kickoff_date=row.kickoff_at.isoformat(),
            )

            x = [features[f] for f in feature_names]

            # Label: 0=HOME, 1=DRAW, 2=AWAY
            hs, as_ = row.home_score, row.away_score
            if hs > as_:
                y = 0
            elif hs == as_:
                y = 1
            else:
                y = 2

            X_rows.append(x)
            y_rows.append(y)
        except Exception as e:
            logger.warning(f"Skipping match {row.id}: {e}")
            continue

    if not X_rows:
        return np.array([]), np.array([])

    return np.array(X_rows, dtype=float), np.array(y_rows, dtype=int)


# ── Training ──────────────────────────────────────────────────────────────────

def train(db: Session) -> list[ModelMetrics]:
    """
    Trains all 8 models with 5-fold CV, selects the best, retrains on full data.
    Thread-safe — uses a lock to prevent concurrent training.
    Returns a list of ModelMetrics for all models.
    """
    with _lock:
        logger.info("Loading training data...")
        X, y = _load_training_data(db)

        if len(X) < MIN_TRAINING_SAMPLES:
            logger.warning(f"Not enough training data ({len(X)} samples, need {MIN_TRAINING_SAMPLES})")
            return []

        logger.info(f"Training on {len(X)} samples with {X.shape[1]} features...")

        models  = _build_models()
        cv      = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        metrics = []

        best_score     = -1.0
        best_model_name = ""

        for name, pipeline in models.items():
            try:
                scores = cross_val_score(
                    pipeline, X, y,
                    cv=cv,
                    scoring="balanced_accuracy",
                    n_jobs=1,
                )
                mean_score = float(scores.mean())
                std_score  = float(scores.std())
                metrics.append(ModelMetrics(name=name, cv_accuracy=mean_score, cv_std=std_score))
                logger.info(f"  {name}: {mean_score:.3f} ± {std_score:.3f}")

                if mean_score > best_score:
                    best_score      = mean_score
                    best_model_name = name
            except Exception as e:
                logger.error(f"  {name} failed during CV: {e}")
                metrics.append(ModelMetrics(name=name, cv_accuracy=0.0, cv_std=0.0))

        # Mark the best model
        for m in metrics:
            m.is_best = m.name == best_model_name

        # Retrain best model on full dataset
        best_pipeline = models[best_model_name]
        best_pipeline.fit(X, y)

        _state.best_model      = best_pipeline
        _state.best_model_name = best_model_name
        _state.all_metrics     = metrics
        _state.trained         = True
        _state.training_samples = len(X)

        logger.info(f"Best model: {best_model_name} (balanced_accuracy={best_score:.3f})")
        return metrics


def _ensure_trained(db: Session) -> None:
    """Trains if not already trained."""
    if not _state.trained:
        train(db)


# ── Prediction ────────────────────────────────────────────────────────────────

def predict(
    db: Session,
    home_team_id: int,
    away_team_id: int,
    competition_season_id: int,
    kickoff_date: str,
) -> dict:
    """
    Returns prediction probabilities and the predicted result for a match.
    Trains the model if not already trained.
    """
    _ensure_trained(db)

    if not _state.best_model:
        return {
            "error":      "Not enough training data",
            "model":      None,
            "home_win":   0.33,
            "draw":       0.33,
            "away_win":   0.34,
            "predicted":  "HOME",
            "confidence": 0.33,
        }

    feature_names = get_feature_names()
    features      = build_match_features(
        db=db,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        competition_season_id=competition_season_id,
        kickoff_date=kickoff_date,
    )

    x      = np.array([[features[f] for f in feature_names]], dtype=float)
    probas = _state.best_model.predict_proba(x)[0]  # shape (3,)

    # Map class indices to HOME/DRAW/AWAY
    classes    = _state.best_model.classes_
    prob_map   = {LABEL_MAP[c]: float(probas[i]) for i, c in enumerate(classes)}

    home_win   = prob_map.get("HOME", 0.33)
    draw       = prob_map.get("DRAW", 0.33)
    away_win   = prob_map.get("AWAY", 0.34)

    confidence    = max(home_win, draw, away_win)
    predicted_idx = int(np.argmax([home_win, draw, away_win]))
    predicted     = ["HOME", "DRAW", "AWAY"][predicted_idx]

    return {
        "model":      _state.best_model_name,
        "home_win":   home_win,
        "draw":       draw,
        "away_win":   away_win,
        "predicted":  predicted,
        "confidence": confidence,
    }


def get_metrics() -> list[dict]:
    """Returns cached CV metrics for all models."""
    return [
        {
            "name":        m.name,
            "cv_accuracy": round(m.cv_accuracy, 4),
            "cv_std":      round(m.cv_std, 4),
            "is_best":     m.is_best,
        }
        for m in _state.all_metrics
    ]


def get_state_summary() -> dict:
    return {
        "trained":           _state.trained,
        "best_model":        _state.best_model_name,
        "training_samples":  _state.training_samples,
    }
