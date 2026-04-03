from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from services.ratings import (
    get_player_rating,
    get_all_ratings,
    invalidate_cache,
)

router = APIRouter(prefix="/ratings", tags=["ratings"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class PlayerRatingResponse(BaseModel):
    player_id:   int
    player_name: str
    position:    str
    overall:     int
    attributes:  dict[str, int]
    attr_labels: list[str]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/player/{player_id}", response_model=PlayerRatingResponse)
def get_rating(player_id: int):
    """Get computed rating for a single player."""
    rating = get_player_rating(player_id)
    if not rating:
        raise HTTPException(status_code=404, detail=f"No rating found for player {player_id}")
    return rating


@router.get("/batch", response_model=list[PlayerRatingResponse])
def get_batch_ratings(ids: str):
    """
    Get ratings for multiple players.
    Pass comma-separated IDs: ?ids=1,2,3
    """
    try:
        id_list = [int(x.strip()) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be comma-separated integers")

    all_ratings = get_all_ratings()
    result = []
    for pid in id_list:
        r = all_ratings.get(pid)
        if r:
            result.append(r)
    return result


@router.get("/all", response_model=list[PlayerRatingResponse])
def get_all(position: str | None = None):
    """
    Get all computed ratings. Optionally filter by position (GK | CB | CM | ST).
    """
    all_ratings = get_all_ratings()
    result = list(all_ratings.values())
    if position:
        result = [r for r in result if r.position == position.upper()]
    return result


@router.post("/refresh")
def refresh_ratings(background_tasks: BackgroundTasks):
    """Force a cache refresh on the next request."""
    background_tasks.add_task(invalidate_cache)
    return {"message": "Cache will be refreshed on next request"}
