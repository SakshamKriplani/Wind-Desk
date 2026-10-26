"""Forecast selection: which forecast counts as 'the' forecast for a target."""
import pandas as pd

from app.analytics import Prepared, forecast_at_horizon, latest_forecasts
from app.store import Dataset

T = pd.Timestamp


def tiny_dataset():
    target = T("2026-01-10T12:00Z")
    forecasts = pd.DataFrame({
        "publish_time": [T("2026-01-08T00:00Z"), T("2026-01-09T06:00Z"), T("2026-01-10T06:00Z"),
                         T("2026-01-10T11:00Z"), T("2026-01-10T13:00Z")],
        "start_time": [target] * 5,
        "generation": [1000.0, 2000.0, 3000.0, 4000.0, 9999.0],
    })
    actuals = pd.DataFrame({"start_time": [target], "publish_time": [target], "generation": [3500.0]})
    return Prepared(Dataset(actuals, forecasts, {})), target


def test_horizon_picks_latest_run_published_at_least_h_before_target():
    p, target = tiny_dataset()
    pick = lambda h: forecast_at_horizon(p, pd.Series([target]), h).iloc[0]["forecast"]
    assert pick(0) == 4000.0      # 11:00 run, 1h lead
    assert pick(1) == 4000.0      # exactly 1h before is allowed
    assert pick(2) == 3000.0      # 06:00 same day
    assert pick(6) == 3000.0
    assert pick(7) == 2000.0      # previous day 06:00 (30h lead)
    assert pick(30) == 2000.0


def test_forecasts_beyond_48h_or_after_target_are_ignored():
    p, target = tiny_dataset()
    # the 60h-ahead run is dropped and the run published after the target is not a forecast
    assert (p.forecasts["lead_h"] <= 48).all()
    assert (p.forecasts["lead_h"] >= 0).all()
    row = forecast_at_horizon(p, pd.Series([target]), 31).iloc[0]
    assert pd.isna(row["forecast"])


def test_latest_as_of_fixed_cutoff():
    p, target = tiny_dataset()
    row = latest_forecasts(p, pd.Series([target]), T("2026-01-10T09:50Z")).iloc[0]
    assert row["forecast"] == 3000.0
    assert row["publish_time"] == T("2026-01-10T06:00Z")
    assert row["lead_h"] == 6.0
