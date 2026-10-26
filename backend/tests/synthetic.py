"""Synthetic data with the same shape as the Elexon feeds.

Used only by the test suite (and for UI work without network access).
It is clearly tagged ``source = synthetic-test-fixture`` so the UI shows a
warning banner if it is ever loaded by mistake.
"""
from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd

from app.store import Dataset, study_ranges


def make_dataset(seed: int = 7, run_every_h: int = 2, bias_mw: float = 250.0) -> Dataset:
    rng = np.random.default_rng(seed)
    r = study_ranges()
    a_start = pd.Timestamp(r["actuals_from_date"]).tz_localize("UTC") - pd.Timedelta(hours=1)
    a_end = pd.Timestamp(r["actuals_to_date"] + timedelta(days=1)).tz_localize("UTC")
    times = pd.date_range(a_start, a_end, freq="30min", inclusive="left")

    # smooth "weather": a random walk plus slow cycles, clipped to a plausible GB range
    n = len(times)
    walk = np.cumsum(rng.normal(0, 180, n))
    walk -= np.linspace(walk[0], walk[-1], n)
    hours = np.arange(n) / 2
    truth = 11000 + 5000 * np.sin(hours / 37) + 2500 * np.sin(hours / 9.5) + walk
    truth = np.clip(truth, 600, 21500)
    actual = pd.Series(truth, index=times)

    actuals = pd.DataFrame({
        "start_time": times,
        "publish_time": times + pd.Timedelta(minutes=30),
        "generation": np.round(truth),
    })

    pubs = pd.date_range(r["forecasts_publish_from"], r["forecasts_publish_to"],
                         freq=f"{run_every_h}h", inclusive="left") + pd.Timedelta(minutes=30)
    rows = []
    for pub in pubs:
        first = pub.ceil("1h")
        targets = pd.date_range(first, pub + pd.Timedelta(hours=48), freq="1h")
        targets = targets[targets.isin(actual.index)]
        lead = (targets - pub).total_seconds().to_numpy() / 3600
        # errors grow with lead time and are correlated within a run
        shock = np.cumsum(rng.normal(0, 1, len(targets)))
        shock = shock / max(1.0, np.abs(shock).max())
        err = bias_mw + (350 + 55 * lead) * shock + rng.normal(0, 150, len(targets))
        fc = np.clip(actual.loc[targets].to_numpy() + err, 0, None)
        rows.append(pd.DataFrame({"publish_time": pub, "start_time": targets, "generation": np.round(fc)}))
    forecasts = pd.concat(rows, ignore_index=True)

    return Dataset(actuals, forecasts, {"source": "synthetic-test-fixture"})
