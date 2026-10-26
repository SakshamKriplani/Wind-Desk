"""The decision view must only use information available at gate closure."""
from datetime import date, time

import numpy as np
import pandas as pd
import pytest

from app.analytics import Prepared, decision_frame, uk_datetime
from app.store import Dataset

GATE = time(9, 50)


@pytest.mark.parametrize("day", [date(2026, 1, 1), date(2026, 1, 15), date(2026, 1, 31)])
def test_all_forecasts_published_before_gate(ds, day):
    df, tau = decision_frame(Prepared(ds), day, GATE)
    assert len(df) > 0
    assert (df["publish_time"].dropna() <= tau).all()
    assert tau == uk_datetime(day, GATE)


@pytest.mark.parametrize("day", [date(2026, 1, 3), date(2026, 1, 20)])
def test_future_data_cannot_change_the_decision(ds, day):
    tau = uk_datetime(day, GATE)
    base, _ = decision_frame(Prepared(ds), day, GATE)

    # Scramble everything that only becomes known after gate closure
    a = ds.actuals.copy()
    a.loc[pd.to_datetime(a["start_time"], utc=True) > tau - pd.Timedelta(minutes=30), "generation"] = 0.0
    f = ds.forecasts.copy()
    f.loc[pd.to_datetime(f["publish_time"], utc=True) > tau, "generation"] = 99999.0
    tampered, _ = decision_frame(Prepared(Dataset(a, f, {})), day, GATE)

    for col in ["forecast", "p10", "p90", "adjusted", "publish_time"]:
        pd.testing.assert_series_equal(base[col], tampered[col], check_names=False)


def test_band_brackets_forecast_and_is_calibrated(ds):
    p = Prepared(ds)
    cover = []
    for d in range(1, 32):
        df, _ = decision_frame(p, date(2026, 1, d), GATE)
        assert (df["p10"] <= df["forecast"] + 1e-6).all()
        assert (df["p90"] >= df["forecast"] - 1e-6).all()
        cover.append(df["in_band"].dropna().mean())
    # an 80% band should cover roughly 80% of outcomes on stationary synthetic data
    assert 0.6 < np.mean(cover) < 0.95


def test_bias_adjustment_uses_past_errors_and_helps_on_biased_data(ds):
    """Synthetic forecasts lean high by a fixed amount, so removing recent bias should help."""
    p = Prepared(ds)
    raw, adj = [], []
    for d in range(1, 32):
        df, _ = decision_frame(p, date(2026, 1, d), GATE)
        assert (df["adjusted"] < df["forecast"] + 1e-6).all()  # positive bias pulls it down
        raw.append(df["error"].abs().mean())
        adj.append(df["adjusted_error"].abs().mean())
    assert np.mean(adj) < np.mean(raw)
