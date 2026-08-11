# Shared statistical helpers used across the models.
# Pure Python (statistics module) so utilities and tests run without heavy
# dependencies; the models themselves use numpy/scipy equivalents once those
# land in Step 4.

import math
import statistics
from typing import Sequence


def mean(values: Sequence[float]) -> float:
    """Arithmetic mean of a non-empty sequence."""
    if not values:
        raise ValueError("mean() requires at least one value")
    return sum(values) / len(values)


def std_dev(values: Sequence[float], sample: bool = True) -> float:
    """Standard deviation. `sample=True` uses n-1 (stdev), False uses n (pstdev).
    Returns 0.0 for fewer than 2 values (nothing to estimate spread from)."""
    if len(values) < 2:
        return 0.0
    return statistics.stdev(values) if sample else statistics.pstdev(values)


def z_score(value: float, baseline_mean: float, baseline_std: float) -> float:
    """(value - baseline_mean) / baseline_std — 0 when the baseline has no spread."""
    if baseline_std == 0 or not math.isfinite(baseline_std):
        return 0.0
    return (value - baseline_mean) / baseline_std


def clamp(value: float, low: float, high: float) -> float:
    """Clamp a value into the inclusive [low, high] range."""
    return max(low, min(high, value))


def percentile(values: Sequence[float], p: float) -> float:
    """Linear-interpolated percentile (0..100) of a sequence."""
    if not values:
        raise ValueError("percentile() requires at least one value")
    if not 0 <= p <= 100:
        raise ValueError(f"percentile must be 0..100, got {p}")
    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (p / 100.0) * (len(sorted_values) - 1)
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return sorted_values[lower]
    weight = rank - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight
