# =============================================================================
# Player Rating Engine
# Percentile-based ratings computed from player_season_stats.
# Ratings are position-specific: outfield (PAC/SHO/PAS/DRI/DEF/PHY)
# and goalkeeper (DIV/HAN/KIC/REF/SPD/POS).
# =============================================================================

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

import pandas as pd
from scipy.stats import percentileofscore
from sqlalchemy import text

from db import get_db

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

OUTFIELD_ATTRS = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"]
GK_ATTRS       = ["DIV", "HAN", "KIC", "REF", "SPD", "POS"]


@dataclass
class PlayerRating:
    player_id:   int
    player_name: str
    position:    str  # GK | CB | CM | ST
    overall:     int
    attributes:  dict[str, int]  # e.g. {"PAC": 82, "SHO": 87, ...}
    attr_labels: list[str]       # ordered list matching radar chart axes


# ---------------------------------------------------------------------------
# In-memory cache (recomputed every 30 minutes)
# ---------------------------------------------------------------------------

_cache: dict[int, PlayerRating] = {}
_cache_ts: float = 0.0
_CACHE_TTL = 30 * 60  # 30 minutes


def _is_cache_stale() -> bool:
    return time.time() - _cache_ts > _CACHE_TTL


# ---------------------------------------------------------------------------
# SQL query: load player_season_stats joined to player info
# ---------------------------------------------------------------------------

_STATS_SQL = text("""
    SELECT
        p.id                                                    AS player_id,
        COALESCE(p."commonName", p."firstName" || ' ' || p."lastName")
                                                                AS player_name,
        p.position,
        SUM(s.appearances)                                      AS appearances,
        SUM(s.starts)                                           AS starts,
        SUM(s."minutesPlayed")                                  AS minutes_played,
        SUM(s.goals)                                            AS goals,
        SUM(s.assists)                                          AS assists,
        SUM(COALESCE(s.shots, 0))                               AS shots,
        SUM(COALESCE(s."shotsOnTarget", 0))                     AS shots_on_target,
        SUM(COALESCE(s.passes, 0))                              AS passes,
        SUM(COALESCE(s."passesCompleted", 0))                   AS passes_completed,
        SUM(COALESCE(s."keyPasses", 0))                         AS key_passes,
        SUM(COALESCE(s.dribbles, 0))                            AS dribbles,
        SUM(COALESCE(s."dribblesCompleted", 0))                 AS dribbles_completed,
        SUM(COALESCE(s.tackles, 0))                             AS tackles,
        SUM(COALESCE(s.interceptions, 0))                       AS interceptions,
        SUM(COALESCE(s.clearances, 0))                          AS clearances,
        SUM(COALESCE(s."foulsCommitted", 0))                    AS fouls_committed,
        SUM(COALESCE(s."foulsSuffered", 0))                     AS fouls_suffered,
        SUM(COALESCE(s.saves, 0))                               AS saves,
        SUM(s."yellowCards")                                    AS yellow_cards,
        SUM(s."redCards")                                       AS red_cards,
        AVG(s."averageRating")                                  AS average_rating
    FROM players p
    JOIN player_season_stats s ON s."playerId" = p.id
    WHERE s."minutesPlayed" > 0
    GROUP BY p.id, p."commonName", p."firstName", p."lastName", p.position
""")


# ---------------------------------------------------------------------------
# Raw composite scores (pre-percentile)
# ---------------------------------------------------------------------------

def _per90(val: float, minutes: float) -> float:
    """Normalize a counting stat to per-90-minutes rate."""
    return val / (minutes / 90.0) if minutes > 0 else 0.0


def _safe_ratio(num: float, denom: float) -> float:
    return num / denom if denom > 0 else 0.0


def _compute_outfield_raws(row: pd.Series) -> dict[str, float]:
    """
    Composite raw scores for outfield players (CB / CM / ST).
    Each score is a weighted combination of per-90 stats.
    These are NOT yet percentiled — just raw composites.
    """
    mins   = float(row.minutes_played or 1)
    apps   = float(row.appearances or 1)

    goals_p90       = _per90(row.goals,             mins)
    shots_p90       = _per90(row.shots,              mins)
    shot_acc        = _safe_ratio(row.shots_on_target, row.shots)
    assists_p90     = _per90(row.assists,            mins)
    pass_acc        = _safe_ratio(row.passes_completed, row.passes)
    key_passes_p90  = _per90(row.key_passes,         mins)
    dribbles_p90    = _per90(row.dribbles,           mins)
    drib_success    = _safe_ratio(row.dribbles_completed, row.dribbles)
    fouls_suf_p90   = _per90(row.fouls_suffered,     mins)
    tackles_p90     = _per90(row.tackles,            mins)
    intercept_p90   = _per90(row.interceptions,      mins)
    clearances_p90  = _per90(row.clearances,         mins)
    fouls_com_p90   = _per90(row.fouls_committed,    mins)
    cards_per_game  = (row.yellow_cards + row.red_cards * 3) / apps
    min_per_game    = mins / apps

    # PAC — proxy: dribbling + direct play speed (no GPS data available)
    pac = (
        dribbles_p90     * 0.45 +
        fouls_suf_p90    * 0.35 +   # getting fouled implies beating defenders
        goals_p90        * 0.20
    )

    # SHO — shooting quality
    sho = (
        goals_p90        * 0.40 +
        shot_acc         * 0.35 +
        shots_p90        * 0.25
    )

    # PAS — passing quality
    pas = (
        pass_acc         * 0.40 +
        key_passes_p90   * 0.35 +
        assists_p90      * 0.25
    )

    # DRI — dribbling quality
    dri = (
        drib_success     * 0.45 +
        dribbles_p90     * 0.35 +
        fouls_suf_p90    * 0.20
    )

    # DEF — defensive contribution
    def_ = (
        tackles_p90      * 0.35 +
        intercept_p90    * 0.35 +
        clearances_p90   * 0.30
    )

    # PHY — fitness/physicality (higher = more disciplined + plays full games)
    discipline = 1.0 / (1.0 + cards_per_game)
    availability = min_per_game / 90.0   # 1.0 = plays full 90 on average
    phy = (
        availability     * 0.50 +
        discipline       * 0.30 +
        (1.0 / (1.0 + fouls_com_p90)) * 0.20
    )

    return {"PAC": pac, "SHO": sho, "PAS": pas, "DRI": dri, "DEF": def_, "PHY": phy}


def _compute_gk_raws(row: pd.Series) -> dict[str, float]:
    """
    Composite raw scores for goalkeepers.
    API-Football gives us saves and averageRating for GKs.
    """
    mins  = float(row.minutes_played or 1)
    apps  = float(row.appearances or 1)
    avg_r = float(row.average_rating or 5.0)   # 0–10 scale

    saves_p90      = _per90(row.saves, mins)
    min_per_game   = mins / apps
    availability   = min_per_game / 90.0
    cards_per_game = (row.yellow_cards + row.red_cards * 3) / apps
    discipline     = 1.0 / (1.0 + cards_per_game)

    # For GKs we have limited stats — use saves + averageRating as primary signals

    # DIV — shot stopping (saves per 90)
    div = saves_p90 * 0.70 + (avg_r / 10.0) * 0.30

    # HAN — handling (proxy via discipline/positioning)
    han = discipline * 0.60 + availability * 0.40

    # KIC — kicking (proxy via pass accuracy if available)
    pass_acc = _safe_ratio(row.passes_completed, row.passes)
    kic = pass_acc * 0.80 + (avg_r / 10.0) * 0.20

    # REF — reflexes (saves per 90 + avg rating)
    ref = saves_p90 * 0.60 + (avg_r / 10.0) * 0.40

    # SPD — speed (physical proxy)
    spe = availability * 0.70 + discipline * 0.30

    # POS — positioning (average rating primary signal)
    pos = (avg_r / 10.0) * 0.80 + availability * 0.20

    return {"DIV": div, "HAN": han, "KIC": kic, "REF": ref, "SPD": spe, "POS": pos}


# ---------------------------------------------------------------------------
# Percentile conversion within a position group
# ---------------------------------------------------------------------------

def _percentile_rank(df_group: pd.DataFrame, attr: str) -> pd.Series:
    """
    Convert raw scores to 1–99 percentile within the group.
    Uses scipy percentileofscore (kind='weak') so ties get equal ranks.
    """
    scores = df_group[attr].values
    return df_group[attr].apply(
        lambda v: max(1, min(99, int(percentileofscore(scores, v, kind="weak"))))
    )


# ---------------------------------------------------------------------------
# Main computation
# ---------------------------------------------------------------------------

def _compute_all() -> dict[int, PlayerRating]:
    with get_db() as db:
        rows = db.execute(_STATS_SQL).mappings().all()

    if not rows:
        return {}

    df = pd.DataFrame([dict(r) for r in rows])
    df = df.fillna(0)

    ratings: dict[int, PlayerRating] = {}

    # ---- Outfield (CB / CM / ST) ----
    outfield = df[df["position"] != "GK"].copy()
    if not outfield.empty:
        raws   = outfield.apply(_compute_outfield_raws, axis=1)
        raw_df = pd.DataFrame(raws.tolist(), index=outfield.index)
        for attr in OUTFIELD_ATTRS:
            outfield[attr] = _percentile_rank(raw_df, attr)

        for _, row in outfield.iterrows():
            attrs = {a: int(row[a]) for a in OUTFIELD_ATTRS}
            overall = int(sum(attrs.values()) / len(attrs))
            ratings[int(row.player_id)] = PlayerRating(
                player_id   = int(row.player_id),
                player_name = row.player_name,
                position    = row.position,
                overall     = overall,
                attributes  = attrs,
                attr_labels = OUTFIELD_ATTRS,
            )

    # ---- Goalkeepers ----
    gks = df[df["position"] == "GK"].copy()
    if not gks.empty:
        raws = gks.apply(lambda r: _compute_gk_raws(r), axis=1)
        raw_df = pd.DataFrame(raws.tolist(), index=gks.index)
        for attr in GK_ATTRS:
            gks[attr] = _percentile_rank(raw_df, attr)

        for _, row in gks.iterrows():
            attrs = {a: int(row[a]) for a in GK_ATTRS}
            overall = int(sum(attrs.values()) / len(attrs))
            ratings[int(row.player_id)] = PlayerRating(
                player_id   = int(row.player_id),
                player_name = row.player_name,
                position    = row.position,
                overall     = overall,
                attributes  = attrs,
                attr_labels = GK_ATTRS,
            )

    return ratings


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_all_ratings() -> dict[int, PlayerRating]:
    global _cache, _cache_ts
    if _is_cache_stale():
        _cache   = _compute_all()
        _cache_ts = time.time()
    return _cache


def get_player_rating(player_id: int) -> Optional[PlayerRating]:
    return get_all_ratings().get(player_id)


def invalidate_cache() -> None:
    global _cache_ts
    _cache_ts = 0.0
