# Shared input validation helpers for the routes.

import math
from typing import Sequence


def require_non_empty(rows: Sequence, name: str = "input") -> None:
    """Raises ValueError when a required list is empty."""
    if not rows:
        raise ValueError(f"{name} must contain at least one row")


def require_finite_numbers(values: Sequence[float], name: str = "value") -> None:
    """Raises ValueError when any value is NaN or infinite."""
    for v in values:
        try:
            f = float(v)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{name} contains a non-numeric value: {v!r}") from exc
        if not math.isfinite(f):
            raise ValueError(f"{name} contains a non-finite value: {v!r}")


def require_non_negative(value: float, name: str = "value") -> None:
    """Raises ValueError when a value is negative."""
    if value < 0:
        raise ValueError(f"{name} must be >= 0, got {value}")
