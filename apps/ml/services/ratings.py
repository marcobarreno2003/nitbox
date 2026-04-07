# =============================================================================
# Player Rating Engine v2
# Position-aware, null-safe percentile ratings.
# Uses API-Football match rating as primary anchor (RAT attribute).
# Gracefully handles sparse data typical for national team players.
#
# Overall = weighted avg where RAT counts 2× (most reliable signal).
# Attributes with value -1 = no data available for that player.
# =============================================================================

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

import pandas as pd
from scipy.stats import percentileofscore
from sqlalchemy import text

from db import get_db

# ---------------------------------------------------------------------------
# Attribute sets by position group
# ---------------------------------------------------------------------------

GK_ATTRS  = ["DIV", "HAN", "KIC", "REF", "SPD", "POS"]
DEF_ATTRS = ["DEF", "AER", "PAS", "PHY", "ATK", "RAT"]
MID_ATTRS = ["PAS", "DEF", "DRI", "ATK", "PHY", "RAT"]
FWD_ATTRS = ["ATK", "DRI", "PAS", "SPD", "PHY", "RAT"]

DEF_POSITIONS = {"CB", "LB", "RB", "LWB", "RWB"}
MID_POSITIONS = {"CDM", "CM", "CAM", "LM", "RM", "M"}
FWD_POSITIONS = {"LW", "RW", "ST", "CF", "SS"}


def _position_group(pos: str) -> str:
    if pos == "GK":           return "GK"
    if pos in DEF_POSITIONS:  return "DEF"
    if pos in FWD_POSITIONS:  return "FWD"
    return "MID"  # CDM/CM/CAM and unknowns


def _attr_labels(pos: str) -> list[str]:
    g = _position_group(pos)
    if g == "GK":  return GK_ATTRS
    if g == "DEF": return DEF_ATTRS
    if g == "FWD": return FWD_ATTRS
    return MID_ATTRS


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class PlayerRating:
    player_id:        int
    player_name:      str
    position:         str
    overall:          int
    attributes:       dict[str, int]   # attr → 1-99, or -1 if no data
    attr_labels:      list[str]
    matches_analyzed: int
    data_confidence:  str              # "high" | "medium" | "low"
    has_api_rating:   bool


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_cache:    dict[int, PlayerRating] = {}
_cache_ts: float = 0.0
_CACHE_TTL = 30 * 60


def _is_cache_stale() -> bool:
    return time.time() - _cache_ts > _CACHE_TTL


# ---------------------------------------------------------------------------
# SQL — nullable stats stay NULL (no COALESCE 0) so we can detect missing data
# ---------------------------------------------------------------------------

_STATS_SQL = text("""
    SELECT
        p.id                                                        AS player_id,
        COALESCE(p."commonName", p."firstName" || ' ' || p."lastName")
                                                                    AS player_name,
        p.position,
        SUM(s.appearances)                                          AS appearances,
        SUM(s."minutesPlayed")                                      AS minutes_played,
        SUM(s.goals)                                                AS goals,
        SUM(s.assists)                                              AS assists,
        SUM(s.shots)                                                AS shots,
        SUM(s."shotsOnTarget")                                      AS shots_on_target,
        SUM(s.passes)                                               AS passes,
        SUM(s."passesCompleted")                                    AS passes_completed,
        SUM(s."keyPasses")                                          AS key_passes,
        SUM(s.dribbles)                                             AS dribbles,
        SUM(s."dribblesCompleted")                                  AS dribbles_completed,
        SUM(s.tackles)                                              AS tackles,
        SUM(s.interceptions)                                        AS interceptions,
        SUM(s.clearances)                                           AS clearances,
        SUM(COALESCE(s."foulsCommitted", 0))                        AS fouls_committed,
        SUM(COALESCE(s."foulsSuffered",  0))                        AS fouls_suffered,
        SUM(COALESCE(s.saves, 0))                                   AS saves,
        SUM(s."yellowCards")                                        AS yellow_cards,
        SUM(s."redCards")                                           AS red_cards,
        AVG(s."averageRating")                                      AS average_rating
    FROM players p
    JOIN player_season_stats s ON s."playerId" = p.id
    WHERE s."minutesPlayed" > 0
    GROUP BY p.id, p."commonName", p."firstName", p."lastName", p.position
    HAVING SUM(s.appearances) > 0
""")

_MATCH_COUNT_SQL = text("""
    SELECT "playerId" AS player_id, COUNT(*) AS match_count
    FROM player_match_stats
    WHERE "minutesPlayed" > 0
    GROUP BY "playerId"
""")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _per90(val, minutes: float) -> Optional[float]:
    if val is None or pd.isna(val) or minutes <= 0:
        return None
    return float(val) / (minutes / 90.0)


def _safe_ratio(num, denom) -> Optional[float]:
    if num is None or denom is None or pd.isna(num) or pd.isna(denom):
        return None
    d = float(denom)
    return float(num) / d if d > 0 else None


def _has(val) -> bool:
    return val is not None and not pd.isna(val) and float(val) > 0


def _weighted(components: list[tuple[float, float]]) -> Optional[float]:
    """Weighted average from (value, weight) pairs. Returns None if empty."""
    if not components:
        return None
    total_w = sum(w for _, w in components)
    return sum(v * w for v, w in components) / total_w if total_w > 0 else None


# ---------------------------------------------------------------------------
# Raw composites — null-safe
# ---------------------------------------------------------------------------

def _outfield_raws(row: pd.Series) -> dict[str, Optional[float]]:
    mins = float(row.minutes_played or 1)
    apps = float(row.appearances or 1)

    # Always-available (never null in schema)
    goals_p90     = _per90(row.goals,   mins) or 0.0
    assists_p90   = _per90(row.assists, mins) or 0.0
    fouls_com_p90 = _per90(row.fouls_committed, mins) or 0.0
    fouls_suf_p90 = _per90(row.fouls_suffered,  mins) or 0.0
    cards_per_app = (float(row.yellow_cards or 0) + float(row.red_cards or 0) * 3) / apps
    discipline    = 1.0 / (1.0 + cards_per_app)
    availability  = min(1.0, (mins / apps) / 90.0)
    avg_r         = float(row.average_rating) if _has(row.get("average_rating")) else None

    # Nullable — only populated when API reported them
    shots_p90      = _per90(row.shots, mins)         if _has(row.shots)         else None
    shot_acc       = _safe_ratio(row.shots_on_target, row.shots)
    pass_acc       = _safe_ratio(row.passes_completed, row.passes)
    key_passes_p90 = _per90(row.key_passes, mins)    if _has(row.key_passes)    else None
    dribbles_p90   = _per90(row.dribbles,   mins)    if _has(row.dribbles)      else None
    drib_success   = _safe_ratio(row.dribbles_completed, row.dribbles)
    tackles_p90    = _per90(row.tackles,       mins) if _has(row.tackles)       else None
    intercept_p90  = _per90(row.interceptions, mins) if _has(row.interceptions) else None
    clearances_p90 = _per90(row.clearances,    mins) if _has(row.clearances)    else None

    result: dict[str, Optional[float]] = {}

    # RAT — API match rating normalized to 0-1 (always preferred signal)
    result["RAT"] = avg_r / 10.0 if avg_r is not None else None

    # ATK — attacking threat (goals/assists always available)
    atk: list[tuple[float, float]] = [(goals_p90, 0.45), (assists_p90, 0.25)]
    if shots_p90 is not None: atk.append((shots_p90, 0.15))
    if shot_acc  is not None: atk.append((shot_acc,  0.15))
    result["ATK"] = _weighted(atk)

    # PAS — passing (pass_acc nullable, assists always available)
    pas: list[tuple[float, float]] = [(assists_p90, 0.20)]
    if pass_acc       is not None: pas.append((pass_acc,        0.45))
    if key_passes_p90 is not None: pas.append((key_passes_p90,  0.35))
    result["PAS"] = _weighted(pas)

    # DRI — dribbling (fouls_suffered is a proxy when dribble data missing)
    dri: list[tuple[float, float]] = [(fouls_suf_p90, 0.15)]
    if drib_success is not None: dri.append((drib_success,  0.50))
    if dribbles_p90 is not None: dri.append((dribbles_p90,  0.35))
    result["DRI"] = _weighted(dri)

    # DEF — defensive work (fully nullable; -1 if no data at all)
    def_: list[tuple[float, float]] = []
    if tackles_p90    is not None: def_.append((tackles_p90,    0.40))
    if intercept_p90  is not None: def_.append((intercept_p90,  0.35))
    if clearances_p90 is not None: def_.append((clearances_p90, 0.25))
    result["DEF"] = _weighted(def_) if def_ else None

    # AER — aerial proxy: clearances + tackles (defenders)
    aer: list[tuple[float, float]] = []
    if clearances_p90 is not None: aer.append((clearances_p90, 0.70))
    if tackles_p90    is not None: aer.append((tackles_p90,    0.30))
    result["AER"] = _weighted(aer) if aer else None

    # SPD — speed proxy (getting fouled + goals = direct play)
    spd: list[tuple[float, float]] = [(fouls_suf_p90, 0.50), (goals_p90, 0.20)]
    if dribbles_p90 is not None: spd.append((dribbles_p90, 0.30))
    result["SPD"] = _weighted(spd)

    # PHY — fitness & discipline (always computable)
    result["PHY"] = _weighted([
        (availability,                   0.50),
        (discipline,                     0.30),
        (1.0 / (1.0 + fouls_com_p90),    0.20),
    ])

    return result


def _gk_raws(row: pd.Series) -> dict[str, Optional[float]]:
    mins  = float(row.minutes_played or 1)
    apps  = float(row.appearances or 1)
    avg_r = float(row.average_rating) if _has(row.get("average_rating")) else None

    saves_p90   = _per90(row.saves, mins) or 0.0
    availability = min(1.0, (mins / apps) / 90.0)
    cards_per_app= (float(row.yellow_cards or 0) + float(row.red_cards or 0) * 3) / apps
    discipline   = 1.0 / (1.0 + cards_per_app)
    pass_acc     = _safe_ratio(row.passes_completed, row.passes)
    rat          = avg_r / 10.0 if avg_r is not None else None

    div_c = [(saves_p90, 0.70)]
    if rat is not None: div_c.append((rat, 0.30))

    kic_c: list[tuple[float, float]] = []
    if pass_acc is not None: kic_c.append((pass_acc, 0.80))
    if rat      is not None: kic_c.append((rat,      0.20))

    ref_c = [(saves_p90, 0.60)]
    if rat is not None: ref_c.append((rat, 0.40))

    pos_c: list[tuple[float, float]] = [(availability, 0.20)]
    if rat is not None: pos_c.append((rat, 0.80))

    return {
        "DIV": _weighted(div_c),
        "HAN": discipline * 0.60 + availability * 0.40,
        "KIC": _weighted(kic_c) if kic_c else None,
        "REF": _weighted(ref_c),
        "SPD": availability * 0.70 + discipline * 0.30,
        "POS": _weighted(pos_c),
    }


# ---------------------------------------------------------------------------
# Percentile conversion — null-safe
# ---------------------------------------------------------------------------

def _percentile_rank(series: pd.Series) -> pd.Series:
    """
    Rank values to 1-99. Non-null values are ranked within their group.
    Null values → -1 (no data).
    """
    pool = series.dropna().values
    if len(pool) == 0:
        return pd.Series(-1, index=series.index)
    return series.apply(
        lambda v: max(1, min(99, int(percentileofscore(pool, v, kind="weak"))))
        if pd.notna(v) else -1
    )


# ---------------------------------------------------------------------------
# Overall — RAT counts 2× when available
# ---------------------------------------------------------------------------

def _compute_overall(attrs: dict[str, int]) -> int:
    valid = {k: v for k, v in attrs.items() if v > 0}
    if not valid:
        return 50
    if "RAT" in valid:
        total = sum(v for k, v in valid.items() if k != "RAT") + valid["RAT"] * 2
        count = len(valid) - 1 + 2
    else:
        total = sum(valid.values())
        count = len(valid)
    return max(1, min(99, round(total / count)))


def _confidence(n: int) -> str:
    if n >= 10: return "high"
    if n >= 3:  return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Main computation
# ---------------------------------------------------------------------------

def _compute_all() -> dict[int, PlayerRating]:
    with get_db() as db:
        rows = db.execute(_STATS_SQL).mappings().all()
        match_counts: dict[int, int] = {
            int(r["player_id"]): int(r["match_count"])
            for r in db.execute(_MATCH_COUNT_SQL).mappings().all()
        }

    if not rows:
        return {}

    df = pd.DataFrame([dict(r) for r in rows])
    # Do NOT fillna(0) — nulls represent missing data, not zero

    ratings: dict[int, PlayerRating] = {}
    all_outfield_attrs = set(DEF_ATTRS + MID_ATTRS + FWD_ATTRS)

    # ---- Outfield ----
    outfield = df[df["position"] != "GK"].copy()
    if not outfield.empty:
        raws_list = [_outfield_raws(row) for _, row in outfield.iterrows()]
        raw_df = pd.DataFrame(raws_list, index=outfield.index)

        # Percentile rank each attribute within the full outfield pool
        pct_df = pd.DataFrame(index=outfield.index)
        for attr in all_outfield_attrs:
            col = raw_df[attr] if attr in raw_df.columns else pd.Series(None, index=outfield.index)
            pct_df[attr] = _percentile_rank(col)

        for idx, row in outfield.iterrows():
            pos    = str(row["position"])
            labels = _attr_labels(pos)
            attrs  = {a: int(pct_df.loc[idx, a]) if a in pct_df.columns else -1 for a in labels}
            mc     = match_counts.get(int(row["player_id"]), 0)
            ratings[int(row["player_id"])] = PlayerRating(
                player_id        = int(row["player_id"]),
                player_name      = str(row["player_name"]),
                position         = pos,
                overall          = _compute_overall(attrs),
                attributes       = attrs,
                attr_labels      = labels,
                matches_analyzed = mc,
                data_confidence  = _confidence(mc),
                has_api_rating   = _has(row.get("average_rating")),
            )

    # ---- Goalkeepers ----
    gks = df[df["position"] == "GK"].copy()
    if not gks.empty:
        raws_list = [_gk_raws(row) for _, row in gks.iterrows()]
        raw_df = pd.DataFrame(raws_list, index=gks.index)

        pct_df = pd.DataFrame(index=gks.index)
        for attr in GK_ATTRS:
            col = raw_df[attr] if attr in raw_df.columns else pd.Series(None, index=gks.index)
            pct_df[attr] = _percentile_rank(col)

        for idx, row in gks.iterrows():
            attrs = {a: int(pct_df.loc[idx, a]) if a in pct_df.columns else -1 for a in GK_ATTRS}
            mc    = match_counts.get(int(row["player_id"]), 0)
            ratings[int(row["player_id"])] = PlayerRating(
                player_id        = int(row["player_id"]),
                player_name      = str(row["player_name"]),
                position         = str(row["position"]),
                overall          = _compute_overall(attrs),
                attributes       = attrs,
                attr_labels      = GK_ATTRS,
                matches_analyzed = mc,
                data_confidence  = _confidence(mc),
                has_api_rating   = _has(row.get("average_rating")),
            )

    return ratings


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_all_ratings() -> dict[int, PlayerRating]:
    global _cache, _cache_ts
    if _is_cache_stale():
        _cache    = _compute_all()
        _cache_ts = time.time()
    return _cache


def get_player_rating(player_id: int) -> Optional[PlayerRating]:
    return get_all_ratings().get(player_id)


def invalidate_cache() -> None:
    global _cache_ts
    _cache_ts = 0.0
