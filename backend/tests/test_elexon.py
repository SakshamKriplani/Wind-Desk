from unittest.mock import MagicMock

import pandas as pd

from app import elexon


def test_normalise_actuals_filters_wind_and_dedupes():
    recs = [
        {"publishTime": "2026-01-01T00:30:00Z", "startTime": "2026-01-01T00:00:00Z",
         "fuelType": "WIND", "generation": 100},
        {"publishTime": "2026-01-01T01:00:00Z", "startTime": "2026-01-01T00:00:00Z",
         "fuelType": "WIND", "generation": 120},  # re-publication wins
        {"publishTime": "2026-01-01T00:30:00Z", "startTime": "2026-01-01T00:00:00Z",
         "fuelType": "CCGT", "generation": 999},
    ]
    df = elexon.normalise_actuals(recs)
    assert len(df) == 1
    assert df.iloc[0]["generation"] == 120
    assert str(df["start_time"].dt.tz) == "UTC"


def test_normalise_forecasts():
    recs = [
        {"publishTime": "2026-01-01T00:30:00Z", "startTime": "2026-01-01T02:00:00Z", "generation": 5000},
        {"publishTime": "2026-01-01T00:30:00Z", "startTime": "2026-01-01T02:00:00Z", "generation": 5000},
        {"publishTime": "2026-01-01T00:30:00Z", "startTime": "2026-01-01T03:00:00Z", "generation": "5100"},
    ]
    df = elexon.normalise_forecasts(recs)
    assert list(df.columns) == ["publish_time", "start_time", "generation"]
    assert len(df) == 2
    assert df["generation"].tolist() == [5000, 5100]


def test_empty_payloads():
    assert elexon.normalise_actuals([]).empty
    assert elexon.normalise_forecasts([]).empty


def test_get_accepts_list_or_wrapped_payload():
    for payload in ([{"a": 1}], {"data": [{"a": 1}]}):
        resp = MagicMock(status_code=200)
        resp.json.return_value = payload
        session = MagicMock()
        session.get.return_value = resp
        assert elexon._get("/x", {}, session) == [{"a": 1}]


def test_date_chunks_cover_range_without_overlap():
    from datetime import date
    chunks = list(elexon._date_chunks(date(2026, 1, 1), date(2026, 1, 20), 7))
    assert chunks[0] == (date(2026, 1, 1), date(2026, 1, 7))
    assert chunks[-1][1] == date(2026, 1, 20)
    days = sum((b - a).days + 1 for a, b in chunks)
    assert days == 20
