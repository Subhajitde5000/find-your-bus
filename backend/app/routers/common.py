from fastapi import Query


class Paging:
    """Shared `limit` / `offset` query parameters."""

    def __init__(
        self,
        limit: int = Query(50, ge=1, le=200, description="Page size (1-200)"),
        offset: int = Query(0, ge=0, description="Number of items to skip"),
    ) -> None:
        self.limit = limit
        self.offset = offset


def make_page(items: list, total: int, paging: Paging) -> dict:
    return {"items": items, "total": total, "limit": paging.limit, "offset": paging.offset}
