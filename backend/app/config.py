"""Central configuration: study window, market timings and analysis defaults.

Everything that encodes a business assumption lives here so it can be
reviewed in one place.
"""
from __future__ import annotations

import os
from datetime import date, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

# --- Study window -----------------------------------------------------------
# Purchase decisions are made on every day of January 2026 (UK local dates).
# A decision on day D buys power for delivery day D+1, so delivery days run
# from 2 Jan to 1 Feb 2026.
FIRST_DECISION_DAY = date(2026, 1, 1)
LAST_DECISION_DAY = date(2026, 1, 31)

# We also pull a few weeks of history before January. A trader deciding on
# 1 Jan could already see how well recent forecasts performed, and the
# uncertainty band is built only from that kind of already-known history.
ERROR_LOOKBACK_DAYS = 14
HISTORY_DAYS_BEFORE = ERROR_LOOKBACK_DAYS + 3

# --- Market timings -----------------------------------------------------------
# Nord Pool's GB day-ahead auction closes at 09:50 UK time on D-1.
DEFAULT_GATE_CLOSURE = time(9, 50)

# --- Forecast analysis --------------------------------------------------------
MAX_HORIZON_HOURS = 48      # forecasts further out than this are ignored
LEAD_MATCH_HOURS = 3.0      # +/- window when matching historical errors by lead time
BAND_QUANTILES = (0.10, 0.90)

# --- Elexon -------------------------------------------------------------------
ELEXON_BASE_URL = os.getenv(
    "ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1"
)
ELEXON_CHUNK_DAYS = 7
ELEXON_TIMEOUT_S = 60

# --- Storage ------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("DATA_DIR", REPO_ROOT / "data"))
# Fallback when DATA_DIR is read-only (e.g. serverless platforms).
FALLBACK_CACHE_DIR = Path(os.getenv("FALLBACK_CACHE_DIR", "/tmp/windesk-cache"))
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", REPO_ROOT / "frontend" / "dist"))
