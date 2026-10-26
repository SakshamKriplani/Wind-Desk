"""Cold start: no snapshot on disk, so the store fetches from Elexon and caches it."""
from app import config, elexon, store as store_mod


def fake_get(path, params, session=None):
    if "FUELHH" in path:
        return [{"publishTime": "2026-01-01T00:30:00Z", "startTime": "2026-01-01T00:00:00Z",
                 "fuelType": "WIND", "generation": 9000}]
    return [{"publishTime": "2025-12-31T09:30:00Z", "startTime": "2026-01-01T00:00:00Z", "generation": 9500}]


def test_cold_start_fetches_then_caches(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "FALLBACK_CACHE_DIR", tmp_path / "cache")
    calls = []
    monkeypatch.setattr(elexon, "_get", lambda *a, **k: calls.append(a[0]) or fake_get(*a, **k))

    ds = store_mod.DataStore().get()
    assert calls, "expected a live fetch"
    assert ds.meta["source"] == "elexon-bmrs"
    assert (tmp_path / "data" / store_mod.FORECASTS_FILE).exists()

    # second process start reads the snapshot instead of calling the API
    calls.clear()
    ds2 = store_mod.DataStore().get()
    assert not calls
    assert len(ds2.forecasts) == len(ds.forecasts)
    assert str(ds2.forecasts["publish_time"].dt.tz) == "UTC"


def test_fetch_requests_cover_study_window(monkeypatch):
    seen = []
    monkeypatch.setattr(elexon, "_get", lambda path, params, session=None: seen.append((path, params)) or [])
    store_mod.fetch_from_elexon()
    fuel = [p for path, p in seen if "FUELHH" in path]
    wind = [p for path, p in seen if "WINDFOR" in path]
    assert fuel[0]["settlementDateFrom"] == "2025-12-15" and fuel[-1]["settlementDateTo"] == "2026-02-01"
    assert all(p["fuelType"] == "WIND" for p in fuel)
    assert wind[0]["publishDateTimeFrom"] == "2025-12-13T00:00:00Z"
    assert wind[-1]["publishDateTimeTo"] == "2026-02-01T23:59:59Z"
