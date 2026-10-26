"""Loads the study data once and keeps it in memory.

Order of preference:
1. CSV snapshot in DATA_DIR (committed to the repo, so deploys are fast and
   reproducible - January 2026 is history and will not change)
2. CSV cache in FALLBACK_CACHE_DIR (written by a previous live fetch)
3. Live fetch from Elexon, then written to whichever cache dir is writable
"""
from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from . import config, elexon

log = logging.getLogger(__name__)

ACTUALS_FILE = "actuals_wind.csv"
FORECASTS_FILE = "forecasts_wind.csv"
META_FILE = "meta.json"


def study_ranges() -> dict:
    """UTC bounds of the data the app needs, derived from the decision window."""
    first_decision = datetime.combine(config.FIRST_DECISION_DAY, datetime.min.time(), config.UK_TZ)
    last_delivery_end = datetime.combine(
        config.LAST_DECISION_DAY + timedelta(days=2), datetime.min.time(), config.UK_TZ)
    history_start = first_decision - timedelta(days=config.HISTORY_DAYS_BEFORE)
    return {
        # actuals: from the start of the error-history window to the end of the last delivery day
        "actuals_from_date": history_start.date(),
        "actuals_to_date": (last_delivery_end - timedelta(days=1)).date(),
        # forecasts: published early enough to cover history targets at a 48h lead,
        # through to the end of the last delivery day (for accuracy evaluation)
        "forecasts_publish_from": (history_start - timedelta(hours=config.MAX_HORIZON_HOURS))
        .astimezone(timezone.utc),
        "forecasts_publish_to": last_delivery_end.astimezone(timezone.utc),
    }


@dataclass
class Dataset:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame
    meta: dict = field(default_factory=dict)


def _read_dir(path: Path) -> Dataset | None:
    a, f = path / ACTUALS_FILE, path / FORECASTS_FILE
    if not (a.exists() and f.exists()):
        return None
    actuals = pd.read_csv(a, parse_dates=["start_time", "publish_time"])
    forecasts = pd.read_csv(f, parse_dates=["publish_time", "start_time"])
    for df, cols in ((actuals, ["start_time", "publish_time"]), (forecasts, ["publish_time", "start_time"])):
        for c in cols:
            df[c] = pd.to_datetime(df[c], utc=True)
    meta_path = path / META_FILE
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta.setdefault("loaded_from", str(path))
    return Dataset(actuals, forecasts, meta)


def write_dir(ds: Dataset, path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    ds.actuals.to_csv(path / ACTUALS_FILE, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    ds.forecasts.to_csv(path / FORECASTS_FILE, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    (path / META_FILE).write_text(json.dumps(ds.meta, indent=2, default=str))


def fetch_from_elexon() -> Dataset:
    r = study_ranges()
    actuals = elexon.fetch_actuals(r["actuals_from_date"], r["actuals_to_date"])
    forecasts = elexon.fetch_forecasts(r["forecasts_publish_from"], r["forecasts_publish_to"])
    meta = {
        "source": "elexon-bmrs",
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "datasets": ["FUELHH (fuelType=WIND)", "WINDFOR"],
        "ranges": {k: str(v) for k, v in r.items()},
        "rows": {"actuals": len(actuals), "forecasts": len(forecasts)},
    }
    return Dataset(actuals, forecasts, meta)


class DataStore:
    """Process-wide, lazily loaded dataset."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ds: Dataset | None = None

    def set(self, ds: Dataset) -> None:
        """Inject a dataset directly (used by tests)."""
        with self._lock:
            self._ds = ds

    def get(self) -> Dataset:
        if self._ds is None:
            with self._lock:
                if self._ds is None:
                    self._ds = self._load()
        return self._ds

    def _load(self) -> Dataset:
        for d in (config.DATA_DIR, config.FALLBACK_CACHE_DIR):
            ds = _read_dir(d)
            if ds is not None:
                log.info("Loaded data snapshot from %s", d)
                return ds
        log.info("No snapshot found, fetching from Elexon")
        ds = fetch_from_elexon()
        for d in (config.DATA_DIR, config.FALLBACK_CACHE_DIR):
            try:
                write_dir(ds, d)
                ds.meta["loaded_from"] = str(d)
                break
            except OSError as exc:
                log.warning("Could not cache data in %s: %s", d, exc)
        return ds


store = DataStore()
