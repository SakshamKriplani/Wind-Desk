import pandas as pd

from app.analytics import metrics, step_hours


def test_metrics_known_values():
    err = pd.Series([100.0, -100.0, 300.0, -300.0])
    act = pd.Series([1000.0, 1000.0, 1000.0, 1000.0])
    m = metrics(err, act)
    assert m["n"] == 4
    assert m["mae"] == 200.0
    assert m["bias"] == 0.0
    assert m["rmse"] == round((50000) ** 0.5, 1)
    assert m["nmae_pct"] == 20.0
    assert m["max_abs"] == 300.0
    assert m["max_over"] == 300.0 and m["max_under"] == 300.0


def test_metrics_empty():
    assert metrics(pd.Series([], dtype=float))["n"] == 0


def test_step_hours():
    hh = pd.Series(pd.date_range("2026-01-01", periods=5, freq="30min", tz="UTC"))
    assert step_hours(hh) == 0.5
    assert step_hours(pd.Series(pd.date_range("2026-01-01", periods=5, freq="1h", tz="UTC"))) == 1.0
