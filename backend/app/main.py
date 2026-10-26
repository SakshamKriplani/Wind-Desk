"""HTTP API and static file host for the Wind Desk app."""
from __future__ import annotations

import logging
from datetime import date, datetime, time

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import analytics, config
from .elexon import ElexonError
from .store import store

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="Wind Desk API",
    description="Day-ahead wind forecast and accuracy analytics for GB, January 2026.",
    version="1.0.0",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


# ----------------------------------------------------------------------------
# parameter parsing
# ----------------------------------------------------------------------------
def _gate(value: str | None) -> time:
    if not value:
        return config.DEFAULT_GATE_CLOSURE
    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError:
        raise HTTPException(422, "gate must be a UK time in HH:MM format, for example 09:50")


def _decision_day(value: str) -> date:
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "date must be YYYY-MM-DD")
    if not (config.FIRST_DECISION_DAY <= d <= config.LAST_DECISION_DAY):
        raise HTTPException(
            422, f"date must be a decision day between {config.FIRST_DECISION_DAY} "
                 f"and {config.LAST_DECISION_DAY}")
    return d


def _timestamp(value: str, name: str) -> pd.Timestamp:
    try:
        ts = pd.Timestamp(value)
    except ValueError:
        raise HTTPException(422, f"{name} must be an ISO date or datetime")
    return ts.tz_localize(config.UK_TZ).tz_convert("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")


def _dataset():
    try:
        return store.get()
    except ElexonError as exc:
        raise HTTPException(503, f"Could not load data from Elexon: {exc}")


# ----------------------------------------------------------------------------
# routes
# ----------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def get_meta() -> dict:
    return analytics.meta(_dataset())


@app.get("/api/decision")
def get_decision(
    date_: str = Query(..., alias="date", description="Decision day (UK), YYYY-MM-DD"),
    gate: str | None = Query(None, description="Gate closure, UK time HH:MM"),
) -> dict:
    """Latest forecast available at gate closure for the next delivery day."""
    return analytics.decision_view(_dataset(), _decision_day(date_), _gate(gate))


@app.get("/api/accuracy")
def get_accuracy(gate: str | None = Query(None, description="Gate closure, UK time HH:MM")) -> dict:
    """How accurate the gate-closure forecast was across every January decision."""
    return analytics.accuracy_report(_dataset(), _gate(gate))


@app.get("/api/series")
def get_series(
    start: str = Query(..., description="Start (UK time if no offset)"),
    end: str = Query(..., description="End, exclusive (UK time if no offset)"),
    horizon: float = Query(4.0, ge=0, le=config.MAX_HORIZON_HOURS,
                           description="Forecast horizon in hours"),
) -> dict:
    s, e = _timestamp(start, "start"), _timestamp(end, "end")
    if e <= s:
        raise HTTPException(422, "end must be after start")
    if (e - s) > pd.Timedelta(days=40):
        raise HTTPException(422, "range can be at most 40 days")
    return analytics.series_view(_dataset(), s, e, horizon)


# ----------------------------------------------------------------------------
# single-page app (production build)
# ----------------------------------------------------------------------------
if config.FRONTEND_DIST.exists():
    assets = config.FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        candidate = (config.FRONTEND_DIST / path).resolve()
        if path and candidate.is_file() and config.FRONTEND_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(config.FRONTEND_DIST / "index.html")
