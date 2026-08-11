# In-memory model cache (Step 3).
# Trained models / fitted objects are expensive to build, so we keep them in
# memory between calls. A plain dict would do, but this thin wrapper gives a
# single place to add eviction, TTL and stats later.

import threading
from typing import Any


class ModelCache:
    """Thread-safe in-memory store for trained model objects."""

    def __init__(self) -> None:
        self._store: dict[str, Any] = {}
        self._lock = threading.RLock()

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = value

    def get(self, key: str) -> Any | None:
        with self._lock:
            return self._store.get(key)

    def get_or_default(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._store.get(key, default)

    def has(self, key: str) -> bool:
        with self._lock:
            return key in self._store

    def remove(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._store)

    def keys(self) -> list[str]:
        with self._lock:
            return list(self._store.keys())


# Shared singleton — import this, don't construct your own.
model_cache = ModelCache()
