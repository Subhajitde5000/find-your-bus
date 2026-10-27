from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any
from uuid import uuid4

from pymongo import MongoClient, DESCENDING
from pymongo.collection import Collection
from pymongo.errors import PyMongoError


class StorageUnavailable(Exception):
    """Raised when the configured MongoDB cannot serve a request."""


class SubmissionStore:
    """MongoDB-backed submission storage, with a temporary memory mode for local UI preview."""

    def __init__(self, mongo_uri: str = "", database_name: str = "konbus_user_input") -> None:
        self._client: MongoClient[Any] | None = None
        self._collection: Collection[dict[str, Any]] | None = None
        self._memory: list[dict[str, Any]] = []
        self._lock = Lock()
        if mongo_uri:
            self._client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2500, tz_aware=True)
            self._collection = self._client[database_name]["submissions"]
            self.mode = "mongodb"
        else:
            self.mode = "memory"

    def create(self, values: dict[str, Any]) -> dict[str, Any]:
        document = {
            **values,
            "created_at": datetime.now(timezone.utc),
            "status": "new",
        }
        if self._collection is not None:
            try:
                result = self._collection.insert_one(document)
                document["id"] = str(result.inserted_id)
                document.pop("_id", None)
            except PyMongoError as exc:
                raise StorageUnavailable from exc
            return document

        document["id"] = uuid4().hex
        with self._lock:
            self._memory.insert(0, document)
        return document

    def list(self, kind: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        if self._collection is not None:
            try:
                query = {"kind": kind} if kind else {}
                documents = list(self._collection.find(query).sort("created_at", DESCENDING).limit(limit))
            except PyMongoError as exc:
                raise StorageUnavailable from exc
            return [self._serialize(document) for document in documents]

        with self._lock:
            documents = list(self._memory)
        if kind:
            documents = [document for document in documents if document["kind"] == kind]
        return documents[:limit]

    def ping(self) -> None:
        if self._client is None:
            return
        try:
            self._client.admin.command("ping")
        except PyMongoError as exc:
            raise StorageUnavailable from exc

    def close(self) -> None:
        if self._client is not None:
            self._client.close()

    @staticmethod
    def _serialize(document: dict[str, Any]) -> dict[str, Any]:
        result = {key: value for key, value in document.items() if key != "_id"}
        result["id"] = str(document.get("_id", document.get("id", "")))
        return result
