"""Download the study data from Elexon and save it as a CSV snapshot.

Run from the repo root:

    python backend/scripts/fetch_data.py            # writes ./data
    python backend/scripts/fetch_data.py --out /tmp/x

The app loads this snapshot at startup. Without it, the app fetches the same
data live on first request (slower cold start).
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.store import fetch_from_elexon, write_dir  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=config.DATA_DIR, help="output directory")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    ds = fetch_from_elexon()
    write_dir(ds, args.out)
    print(f"Saved {len(ds.actuals):,} actual rows and {len(ds.forecasts):,} forecast rows to {args.out}")
    if ds.actuals.empty or ds.forecasts.empty:
        sys.exit("Warning: one of the datasets came back empty. Check the API and date ranges.")


if __name__ == "__main__":
    main()
