"""Thin client for the two Elexon BMRS datasets we use.

* FUELHH  - half-hourly outturn generation by fuel type (we keep WIND)
* WINDFOR - national wind generation forecasts, one row per
            (publishTime, startTime)

Both are fetched in week-sized chunks with retries, then normalised into
tidy DataFrames with UTC timestamps.
"""
from __future__ import annotations

import logging
import time as _time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

import pandas as pd
import requests

from . import config

log = logging.getLogger(__name__)

ACTUAL_COLUMNS = ["start_time", "publish_time", "generation"]
FORECAST_COLUMNS = ["publish_time", "start_time", "generation"]


class ElexonError(RuntimeError):
    pass


def _get(path: str, params: dict[str, Any], session: requests.Session | None = None) -> list[dict]:
    """GET a stream endpoint and return its records, retrying transient failures."""
    url = f"{config.ELEXON_BASE_URL}{path}"
    http = session or requests
    last_exc: Exception | None = None
    for attempt in range(4):
        try:
            resp = http.get(url, params=params, timeout=config.ELEXON_TIMEOUT_S,
                            headers={"Accept": "application/json"})
            if resp.status_code == 429 or resp.status_code >= 500:
                raise ElexonError(f"HTTP {resp.status_code} from {url}")
            resp.raise_for_status()
            payload = resp.json()
            # The /stream endpoints return a bare list; other variants wrap in {"data": [...]}
            if isinstance(payload, dict):
                payload = payload.get("data", [])
            if not isinstance(payload, list):
                raise ElexonError(f"Unexpected payload type from {url}: {type(payload)}")
            return payload
        except (requests.RequestException, ElexonError, ValueError) as exc:
            last_exc = exc
            wait = 2 ** attempt
            log.warning("Elexon request failed (%s), retry %d in %ss", exc, attempt + 1, wait)
            _time.sleep(wait)
    raise ElexonError(f"Giving up on {url} {params}: {last_exc}")


def _date_chunks(start: date, end: date, days: int) -> Iterable[tuple[date, date]]:
    """Inclusive date chunks covering [start, end]."""
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=days - 1), end)
        yield cur, stop
        cur = stop + timedelta(days=1)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_actuals(start: date, end: date, session: requests.Session | None = None) -> pd.DataFrame:
    """Wind outturn for settlement dates start..end (inclusive)."""
    records: list[dict] = []
    for a, b in _date_chunks(start, end, config.ELEXON_CHUNK_DAYS):
        log.info("FUELHH %s -> %s", a, b)
        records += _get("/datasets/FUELHH/stream", {
            "settlementDateFrom": a.isoformat(),
            "settlementDateTo": b.isoformat(),
            "fuelType": "WIND",
        }, session)
    return normalise_actuals(records)


def fetch_forecasts(publish_from: datetime, publish_to: datetime,
                    session: requests.Session | None = None) -> pd.DataFrame:
    """Every WINDFOR forecast published in [publish_from, publish_to)."""
    records: list[dict] = []
    cur = publish_from
    step = timedelta(days=config.ELEXON_CHUNK_DAYS)
    while cur < publish_to:
        stop = min(cur + step, publish_to)
        log.info("WINDFOR %s -> %s", cur, stop)
        records += _get("/datasets/WINDFOR/stream", {
            "publishDateTimeFrom": _iso(cur),
            # API bounds are inclusive; step back one second to avoid double counting
            "publishDateTimeTo": _iso(stop - timedelta(seconds=1)),
        }, session)
        cur = stop
    return normalise_forecasts(records)


def _to_utc(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, utc=True)


def normalise_actuals(records: list[dict]) -> pd.DataFrame:
    if not records:
        return pd.DataFrame(columns=ACTUAL_COLUMNS)
    df = pd.DataFrame.from_records(records)
    if "fuelType" in df.columns:
        df = df[df["fuelType"].astype(str).str.upper() == "WIND"]
    df = pd.DataFrame({
        "start_time": _to_utc(df["startTime"]),
        "publish_time": _to_utc(df["publishTime"]) if "publishTime" in df else pd.NaT,
        "generation": pd.to_numeric(df["generation"], errors="coerce"),
    }).dropna(subset=["start_time", "generation"])
    # If a settlement period was re-published, keep the latest value.
    df = (df.sort_values(["start_time", "publish_time"])
            .drop_duplicates("start_time", keep="last")
            .reset_index(drop=True))
    return df[ACTUAL_COLUMNS]


def normalise_forecasts(records: list[dict]) -> pd.DataFrame:
    if not records:
        return pd.DataFrame(columns=FORECAST_COLUMNS)
    df = pd.DataFrame.from_records(records)
    df = pd.DataFrame({
        "publish_time": _to_utc(df["publishTime"]),
        "start_time": _to_utc(df["startTime"]),
        "generation": pd.to_numeric(df["generation"], errors="coerce"),
    }).dropna()
    df = (df.drop_duplicates(["publish_time", "start_time"], keep="last")
            .sort_values(["publish_time", "start_time"])
            .reset_index(drop=True))
    return df[FORECAST_COLUMNS]
