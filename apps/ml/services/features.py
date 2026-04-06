# =============================================================================
# Feature Engineering — builds the feature vector for a match prediction.
#
# Features used:
#   - Recent form: points per game in last 5 matches for each team
#   - Goal stats: avg goals scored / conceded in last 5 matches
#   - H2H (head-to-head): win rates and avg goals in historical matchups
#   - Standings: current points, goal difference, position in competition
#   - Home advantage: is_home flag (1 for home team, -1 for away)
#
# All features are from the home team's perspective (home - away).
# Output is a flat feature vector ready for sklearn models.
# =============================================================================

from __future__ import annotations

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text


RECENT_N = 5  # Number of recent matches to consider for form


def get_team_recent_form(db: Session, team_id: int, before_date: str, n: int = RECENT_N) -> dict:
    """
    Returns form stats for a team's last N finished matches before a given date.
    All matches where the team participated (home or away).
    """
    sql = text("""
        SELECT
            m.id,
            m."kickoffAt"           AS kickoff_at,
            m."homeTeamId"          AS home_team_id,
            m."awayTeamId"          AS away_team_id,
            m."homeScore"           AS home_score,
            m."awayScore"           AS away_score,
            m."statusShort"         AS status_short
        FROM matches m
        WHERE
            (m."homeTeamId" = :team_id OR m."awayTeamId" = :team_id)
            AND m."statusShort" IN ('FT', 'AET', 'PEN')
            AND m."kickoffAt" < :before_date
            AND m."homeScore" IS NOT NULL
            AND m."awayScore" IS NOT NULL
        ORDER BY m."kickoffAt" DESC
        LIMIT :n
    """)

    rows = db.execute(sql, {"team_id": team_id, "before_date": before_date, "n": n}).fetchall()

    if not rows:
        return {
            "games_played": 0,
            "points_per_game": 0.0,
            "goals_scored_avg": 0.0,
            "goals_conceded_avg": 0.0,
            "win_rate": 0.0,
            "draw_rate": 0.0,
            "loss_rate": 0.0,
        }

    points = 0
    goals_scored = 0
    goals_conceded = 0
    wins = draws = losses = 0

    for row in rows:
        is_home = row.home_team_id == team_id
        gf = row.home_score if is_home else row.away_score
        ga = row.away_score if is_home else row.home_score

        goals_scored   += gf or 0
        goals_conceded += ga or 0

        if gf > ga:
            points += 3
            wins   += 1
        elif gf == ga:
            points += 1
            draws  += 1
        else:
            losses += 1

    n_games = len(rows)
    return {
        "games_played":       n_games,
        "points_per_game":    points / n_games,
        "goals_scored_avg":   goals_scored / n_games,
        "goals_conceded_avg": goals_conceded / n_games,
        "win_rate":           wins / n_games,
        "draw_rate":          draws / n_games,
        "loss_rate":          losses / n_games,
    }


def get_h2h_stats(db: Session, home_team_id: int, away_team_id: int, before_date: str, n: int = 10) -> dict:
    """
    Returns head-to-head stats between two teams (last N matches, both directions).
    """
    sql = text("""
        SELECT
            m."homeTeamId"  AS home_team_id,
            m."awayTeamId"  AS away_team_id,
            m."homeScore"   AS home_score,
            m."awayScore"   AS away_score
        FROM matches m
        WHERE
            (
                (m."homeTeamId" = :home_id AND m."awayTeamId" = :away_id)
                OR
                (m."homeTeamId" = :away_id AND m."awayTeamId" = :home_id)
            )
            AND m."statusShort" IN ('FT', 'AET', 'PEN')
            AND m."kickoffAt" < :before_date
            AND m."homeScore" IS NOT NULL
        ORDER BY m."kickoffAt" DESC
        LIMIT :n
    """)

    rows = db.execute(sql, {
        "home_id": home_team_id,
        "away_id": away_team_id,
        "before_date": before_date,
        "n": n,
    }).fetchall()

    if not rows:
        return {"h2h_games": 0, "h2h_home_win_rate": 0.33, "h2h_draw_rate": 0.33, "h2h_away_win_rate": 0.34, "h2h_avg_goals": 2.5}

    home_wins = draws = away_wins = 0
    total_goals = 0

    for row in rows:
        # Normalize: who is "home_team_id" in this h2h context
        if row.home_team_id == home_team_id:
            gf, ga = row.home_score, row.away_score
        else:
            gf, ga = row.away_score, row.home_score

        total_goals += (row.home_score or 0) + (row.away_score or 0)

        if gf > ga:
            home_wins += 1
        elif gf == ga:
            draws += 1
        else:
            away_wins += 1

    n_games = len(rows)
    return {
        "h2h_games":         n_games,
        "h2h_home_win_rate": home_wins / n_games,
        "h2h_draw_rate":     draws / n_games,
        "h2h_away_win_rate": away_wins / n_games,
        "h2h_avg_goals":     total_goals / n_games,
    }


def get_standing_features(db: Session, team_id: int, competition_season_id: int) -> dict:
    """
    Returns current standings position and stats for a team in a competition season.
    """
    sql = text("""
        SELECT
            s.points,
            s."goalDifference"      AS goal_difference,
            s.position,
            s.played,
            s.won,
            s.drawn,
            s.lost,
            s."goalsFor"            AS goals_for,
            s."goalsAgainst"        AS goals_against
        FROM standings s
        WHERE s."teamId" = :team_id
          AND s."competitionSeasonId" = :cs_id
        ORDER BY s."updatedAt" DESC
        LIMIT 1
    """)

    row = db.execute(sql, {"team_id": team_id, "cs_id": competition_season_id}).fetchone()

    if not row:
        return {"standing_points": 0, "standing_gd": 0, "standing_position": 99, "standing_played": 0}

    return {
        "standing_points":   row.points or 0,
        "standing_gd":       row.goal_difference or 0,
        "standing_position": row.position or 99,
        "standing_played":   row.played or 0,
    }


def build_match_features(
    db: Session,
    home_team_id: int,
    away_team_id: int,
    competition_season_id: int,
    kickoff_date: str,
) -> dict[str, float]:
    """
    Builds the complete feature vector for a match as a flat dict.
    All features are expressed as (home - away) differences where applicable,
    plus absolute home/away values and H2H stats.
    """
    home_form = get_team_recent_form(db, home_team_id, kickoff_date)
    away_form = get_team_recent_form(db, away_team_id, kickoff_date)
    h2h       = get_h2h_stats(db, home_team_id, away_team_id, kickoff_date)
    home_std  = get_standing_features(db, home_team_id, competition_season_id)
    away_std  = get_standing_features(db, away_team_id, competition_season_id)

    return {
        # Form differences (home - away)
        "form_ppg_diff":           home_form["points_per_game"]    - away_form["points_per_game"],
        "form_goals_scored_diff":  home_form["goals_scored_avg"]   - away_form["goals_scored_avg"],
        "form_goals_conceded_diff":home_form["goals_conceded_avg"] - away_form["goals_conceded_avg"],
        "form_win_rate_diff":      home_form["win_rate"]           - away_form["win_rate"],

        # Absolute form values
        "home_ppg":                home_form["points_per_game"],
        "away_ppg":                away_form["points_per_game"],
        "home_goals_scored_avg":   home_form["goals_scored_avg"],
        "away_goals_scored_avg":   away_form["goals_scored_avg"],
        "home_goals_conceded_avg": home_form["goals_conceded_avg"],
        "away_goals_conceded_avg": away_form["goals_conceded_avg"],
        "home_win_rate":           home_form["win_rate"],
        "away_win_rate":           away_form["win_rate"],

        # H2H
        "h2h_home_win_rate":       h2h["h2h_home_win_rate"],
        "h2h_draw_rate":           h2h["h2h_draw_rate"],
        "h2h_away_win_rate":       h2h["h2h_away_win_rate"],
        "h2h_avg_goals":           h2h["h2h_avg_goals"],
        "h2h_games":               float(h2h["h2h_games"]),

        # Standings differences (home - away)
        "standing_points_diff":   float(home_std["standing_points"]   - away_std["standing_points"]),
        "standing_gd_diff":       float(home_std["standing_gd"]       - away_std["standing_gd"]),
        "standing_position_diff": float(away_std["standing_position"] - home_std["standing_position"]),  # reversed: lower pos = better

        # Absolute standings
        "home_standing_points":   float(home_std["standing_points"]),
        "away_standing_points":   float(away_std["standing_points"]),

        # Home advantage (constant signal)
        "is_home_advantage":      1.0,
    }


def get_feature_names() -> list[str]:
    """Returns the ordered list of feature names (must match build_match_features keys)."""
    return [
        "form_ppg_diff", "form_goals_scored_diff", "form_goals_conceded_diff", "form_win_rate_diff",
        "home_ppg", "away_ppg",
        "home_goals_scored_avg", "away_goals_scored_avg",
        "home_goals_conceded_avg", "away_goals_conceded_avg",
        "home_win_rate", "away_win_rate",
        "h2h_home_win_rate", "h2h_draw_rate", "h2h_away_win_rate", "h2h_avg_goals", "h2h_games",
        "standing_points_diff", "standing_gd_diff", "standing_position_diff",
        "home_standing_points", "away_standing_points",
        "is_home_advantage",
    ]
