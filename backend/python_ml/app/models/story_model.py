# Story Mode Generator (Step 9).
#
# Turns analytics data into a readable narrative paragraph. Template-driven
# (Step 9.1) with an optional OpenAI enhancement (Step 9.2): when a key is
# present AND the role is analyst/journalist, a structured prompt is sent to
# the (cheapest) model; any failure or missing key falls back to templates —
# the request never fails because of AI. Generated stories are cached for one
# hour; the fan role is never sent to OpenAI.

import hashlib
import json
import os
import time

from app.utils.logger import get_logger

logger = get_logger(__name__)

# Lazy import — the openai package is optional. When it's not installed the
# template system covers every request (see requirements.txt note).
try:  # pragma: no cover — depends on environment
    from openai import OpenAI

    _OPENAI_AVAILABLE = True
except ImportError:  # pragma: no cover
    _OPENAI_AVAILABLE = False

STORY_CACHE_TTL = 3600  # 1 hour (Step 9.2)
_OPENAI_ROLES = {"analyst", "journalist"}

_ZONE_LABELS = {"green": "low", "yellow": "elevated", "red": "high"}
_ZONE_TONE = {"red": "warning", "yellow": "warning", "green": "neutral"}
_RECOMMENDATIONS = {
    "red": "Consider reducing minutes or rest day",
    "yellow": "Monitor closely over next 3 games",
    "green": "Workload within normal range",
}
_VERDICT_LABELS = {
    "significant": "real",
    "not_significant": "a statistical myth in this sport",
    "insufficient_data": "still unproven",
}
_METRIC_LABELS = {"minutes": "Minutes", "distance": "Distance", "intensity": "Intensity"}

# {story cache key: (timestamp, response dict)}
_story_cache: dict[str, tuple[float, dict]] = {}


def _metric(metrics: dict, key: str, default=None):
    value = metrics.get(key, default)
    return default if value is None or value == "" else value


def _public_metrics(metrics: dict) -> dict:
    """Drops internal underscore-prefixed keys (e.g. `_module`) from anything
    that crosses the API boundary."""
    return {k: v for k, v in metrics.items() if not k.startswith("_")}


def _prune_story_cache() -> None:
    """Evicts expired entries; if the cache is still huge, drops it wholesale
    (stories are cheap to regenerate, so bounded memory beats retention)."""
    now = time.time()
    expired = [k for k, (ts, _) in _story_cache.items() if now - ts >= STORY_CACHE_TTL]
    for key in expired:
        del _story_cache[key]
    if len(_story_cache) > 1000:
        _story_cache.clear()


def _templates(module: str) -> dict:
    """Template builders per module — each returns (story, headline, tone)."""
    injury = {
        "trainer": _injury_trainer,
        "fan": _injury_fan,
        "default": _injury_fan,
    }
    decisions = {
        "coach": _decisions_coach,
        "default": _decisions_coach,
    }
    momentum = {
        "analyst": _momentum_analyst,
        "default": _momentum_analyst,
    }
    return {"injury": injury, "decisions": decisions, "momentum": momentum}.get(
        module, {"default": _generic}
    )


# -- module template builders -------------------------------------------------


def _injury_trainer(metrics: dict, sport: str, name: str) -> tuple[str, str, str]:
    zone = str(_metric(metrics, "zone", "yellow")).lower()
    zone_label = _ZONE_LABELS.get(zone, "moderate")
    zone_tone = _ZONE_TONE.get(zone, "neutral")
    metric = str(_metric(metrics, "triggerMetric", "workload")).capitalize()
    metric = _METRIC_LABELS.get(metric.lower(), metric)
    pct = _metric(metrics, "percentageAbove", "a marked")
    days = _metric(metrics, "windowDays", "recent")
    rec = _RECOMMENDATIONS.get(zone, "Monitor closely over next 3 games")

    story = (
        f"{name} is currently showing {zone_label} risk with a score of "
        f"{_metric(metrics, 'riskScore', '--')}/100. {metric} spiked {pct}% above "
        f"their personal baseline over the last {days} days. {rec}."
    )
    if zone == "red":
        headline = f"High injury risk: {name}"
    elif zone == "yellow":
        headline = f"Injury watch: {name}"
    else:
        headline = f"Workload check: {name}"
    return story, headline, zone_tone


def _injury_fan(metrics: dict, sport: str, name: str) -> tuple[str, str, str]:
    zone = str(_metric(metrics, "zone", "yellow")).lower()
    zone_label = _ZONE_LABELS.get(zone, zone)  # raw zone as last resort
    story = (
        f"{name} has been playing more than usual lately. Our system rates their "
        f"injury risk at {_metric(metrics, 'riskScore', '--')} out of 100 which "
        f"is considered {zone_label} risk."
    )
    tone = _ZONE_TONE.get(zone, "neutral")
    headline = f"{name} injury watch" if tone == "warning" else f"{name} workload update"
    return story, headline, tone


def _decisions_coach(metrics: dict, sport: str, name: str) -> tuple[str, str, str]:
    ev_rate = _metric(metrics, "evRate", 0)
    rank = _metric(metrics, "rank", "--")
    total = _metric(metrics, "totalCoaches", "--")
    best_date = _metric(metrics, "bestGameDate", "a recent game")
    best_desc = _metric(metrics, "bestDecisionDesc", "aggressively going for it on fourth down")
    sport_label = sport.upper() if sport else "their sport"

    story = (
        f"{name} has made the statistically optimal decision {ev_rate}% of the "
        f"time this season, ranking {rank} out of {total} coaches in {sport_label}. "
        f"Their best decision came in {best_date} where they correctly {best_desc}."
    )
    try:
        rate = float(ev_rate)
        if rate >= 60:
            tone, headline = "positive", f"{name} winning the decision battle"
        elif rate >= 40:
            tone, headline = "neutral", f"Decision report: {name}"
        else:
            tone, headline = "warning", f"{name} leaving wins on the table"
    except (TypeError, ValueError):
        tone, headline = "neutral", f"Decision report: {name}"
    return story, headline, tone


def _momentum_analyst(metrics: dict, sport: str, name: str) -> tuple[str, str, str]:
    verdict = str(_metric(metrics, "verdictLabel", "insufficient_data")).lower()
    verdict_label = _VERDICT_LABELS.get(verdict, "mixed")
    hazard_change = _metric(metrics, "hazardRateChange", "--")
    p_value = _metric(metrics, "pValue", "--")
    try:
        significant = float(p_value) < 0.05 if p_value not in ("--", None) else verdict == "significant"
    except (TypeError, ValueError):
        significant = verdict == "significant"
    significance = "statistically significant" if significant else "not statistically significant"
    sport_label = sport.upper() if sport else "the league"
    season = _metric(metrics, "season", "the most recent")

    story = (
        f"In the {sport_label}, our Cox proportional hazard model analyzed "
        f"{_metric(metrics, 'gamesAnalyzed', '--')} games from the {season} season. "
        f"The results show that momentum is {verdict_label}. A streak of consecutive "
        f"scores changes the opponent's scoring hazard rate by {hazard_change}% "
        f"(p={p_value}, {significance})."
    )
    tone = "positive" if verdict == "significant" else "neutral"
    headline = f"Momentum report: {sport_label} {season}"
    return story, headline, tone


def _generic(metrics: dict, sport: str, name: str) -> tuple[str, str, str]:
    module_hint = _metric(metrics, "_module", "analytics")
    sport_label = sport.upper() if sport else "the league"
    detail = ""
    pairs = [(k, v) for k, v in metrics.items() if not k.startswith("_")]
    if pairs:
        sample = ", ".join(f"{k}={v}" for k, v in pairs[:3])
        detail = f" Key numbers: {sample}."
    story = (
        f"Here's the {module_hint} outlook for {name} in {sport_label}: "
        f"the latest data is summarized below.{detail}"
    )
    return story, f"{module_hint.capitalize()} report: {name}", "neutral"


# -- OpenAI enhancement (Step 9.2) --------------------------------------------


def _story_cache_key(module: str, sport: str, role: str, entity_id: str | None, metrics: dict) -> str:
    canonical = json.dumps(
        [module, sport, role, entity_id, metrics], sort_keys=True, default=str
    )
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:16]


def _openai_story(module: str, sport: str, role: str, entity_name: str, metrics: dict) -> str | None:
    """Best-effort OpenAI generation; returns None on any failure."""
    if not _OPENAI_AVAILABLE or not os.getenv("OPENAI_API_KEY"):
        return None
    if role not in _OPENAI_ROLES:
        return None
    try:
        client = OpenAI()  # reads OPENAI_API_KEY from env
        system = "You are a sports analytics commentator."
        user = (
            f"Module: {module}\nSport: {sport}\nAudience role: {role}\n"
            f"Subject: {entity_name}\nData: {json.dumps(metrics, default=str)}\n\n"
            "Write a 2-3 sentence analysis of this data."
        )
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-3.5-turbo"),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=150,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:  # noqa: BLE001 — never fail the request because of AI
        logger.warning("story: OpenAI call failed, using template (%s)", exc)
        return None


class StoryModel:
    """Generates plain-English story paragraphs for a module view."""

    def generate(
        self,
        module: str,
        sport: str,
        role: str,
        entity_id: str | None = None,
        entity_name: str | None = None,
        key_metrics: dict | None = None,
    ) -> dict:
        module = (module or "analytics").lower()
        role = (role or "analyst").lower()
        metrics = dict(key_metrics or {})
        metrics.setdefault("_module", module)

        name = entity_name or metrics.get("playerName") or metrics.get("coachName") or "the player"
        public_metrics = _public_metrics(metrics)
        templates = _templates(module)
        builder = templates.get(role, templates.get("default", _generic))
        story, headline, tone = builder(metrics, sport, name)

        generated_by = "template"
        if role in _OPENAI_ROLES:
            cache_key = _story_cache_key(module, sport, role, entity_id, public_metrics)
            now = time.time()
            _prune_story_cache()
            cached = _story_cache.get(cache_key)
            if cached and now - cached[0] < STORY_CACHE_TTL:
                return cached[1]
            ai_text = _openai_story(module, sport, role, name, public_metrics)
            if ai_text:
                story = ai_text
                generated_by = "openai"
                response = {
                    "storyText": story,
                    "headlineText": headline,
                    "toneLabel": tone,
                    "generatedBy": generated_by,
                    "keyMetrics": public_metrics,
                }
                _story_cache[cache_key] = (now, response)
                return response

        return {
            "storyText": story,
            "headlineText": headline,
            "toneLabel": tone,
            "generatedBy": generated_by,
            "keyMetrics": public_metrics,
        }


def warmup() -> None:
    """Pre-loads the story templates."""
    logger.info("story model warmup complete (templates ready, openai=%s)", _OPENAI_AVAILABLE)
