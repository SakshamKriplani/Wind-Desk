def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta(client):
    m = client.get("/api/meta").json()
    assert len(m["decision_days"]) == 31
    assert m["default_gate_closure"] == "09:50"
    assert m["source"] == "synthetic-test-fixture"


def test_decision(client):
    r = client.get("/api/decision", params={"date": "2026-01-15"})
    assert r.status_code == 200
    body = r.json()
    assert body["decision_time"] == "2026-01-15T09:50:00Z"
    assert body["delivery_start"] == "2026-01-16T00:00:00Z"
    assert len(body["points"]) == 24
    assert body["summary"]["energy_mwh"]["p50"] > 0
    assert body["hindsight"]["n"] == 24
    assert body["previous_runs"]
    assert body["summary"]["typical_bias_mw"] > 0
    assert body["summary"]["energy_mwh"]["adjusted"] < body["summary"]["energy_mwh"]["p50"]
    assert all("adjusted" in p for p in body["points"])
    assert body["hindsight"]["adjusted_mae"] is not None


def test_decision_validation(client):
    assert client.get("/api/decision", params={"date": "2026-02-10"}).status_code == 422
    assert client.get("/api/decision", params={"date": "2026-01-10", "gate": "9.50"}).status_code == 422


def test_accuracy(client):
    body = client.get("/api/accuracy").json()
    assert len(body["daily"]) == 31
    assert 40 <= len(body["by_horizon"]) <= 49
    assert all(h["n"] > 0 for h in body["by_horizon"])
    assert body["summary"]["adjusted"]["mae"] < body["summary"]["mae"]
    split = body["summary"]["error_split"]
    assert abs(split["over_pct"] + split["under_pct"] + split["within_pct"] - 100) < 0.5
    imb = body["summary"]["imbalance"]
    assert imb["raw"]["short_mwh"] > imb["raw"]["long_mwh"]  # synthetic forecasts lean high
    assert body["summary"]["mae"] > 0
    # error should broadly grow with horizon
    h = body["by_horizon"]
    assert h[40]["mae"] > h[1]["mae"]


def test_series(client):
    r = client.get("/api/series", params={"start": "2026-01-05", "end": "2026-01-08", "horizon": 4})
    body = r.json()
    assert r.status_code == 200
    assert len(body["actual"]) == 3 * 48
    assert all(p["lead_h"] >= 4 for p in body["forecast"])
    assert client.get("/api/series", params={"start": "2026-01-08", "end": "2026-01-05"}).status_code == 422
