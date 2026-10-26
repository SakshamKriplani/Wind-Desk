"""Forecast selection and accuracy analytics.

Conventions used everywhere:

* Times are tz-aware UTC pandas Timestamps internally; the UI shows UK time.
* ``lead`` = target time - publish time, in hours.
* ``error`` = forecast - actual, in MW. Positive error means the wind came in
  *below* forecast, i.e. the buyer counted on wind that did not arrive.
* ``adjusted`` = forecast - recent bias at the same lead time. It is how the
  measured error feeds back into the buying decision.
* Nothing in the decision view may use information published after the
  decision time. Tests in ``tests/test_no_lookahead.py`` guard this.
"""
from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd

from . import config
from .store import Dataset

NS_UTC = "datetime64[ns, UTC]"
ACTUAL_PUBLISH_DELAY = pd.Timedelta(minutes=30)  # outturn for a period is known once it ends


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def _utc(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True).astype(NS_UTC)


def uk_datetime(d: date, t: time) -> pd.Timestamp:
    """A UK wall-clock time as a UTC Timestamp (handles GMT/BST)."""
    return pd.Timestamp(datetime.combine(d, t, config.UK_TZ)).tz_convert("UTC")


def delivery_window(decision_day: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Delivery day D+1 from 00:00 to 24:00 UK time."""
    return (uk_datetime(decision_day + timedelta(days=1), time(0)),
            uk_datetime(decision_day + timedelta(days=2), time(0)))


def iso(ts: Any) -> str | None:
    if ts is None or (isinstance(ts, float) and math.isnan(ts)) or pd.isna(ts):
        return None
    return pd.Timestamp(ts).tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")


def num(x: Any, nd: int = 1) -> float | None:
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else round(f, nd)


def step_hours(times: pd.Series) -> float:
    """Resolution of a time grid in hours (0.5 for half-hourly, 1.0 for hourly)."""
    if len(times) < 2:
        return 0.5
    diffs = pd.Series(sorted(times)).diff().dropna().dt.total_seconds() / 3600
    return float(diffs.median())


def metrics(error: pd.Series, actual: pd.Series | None = None) -> dict:
    e = pd.Series(error, dtype="float64").dropna()
    if e.empty:
        return {"n": 0, "mae": None, "rmse": None, "bias": None, "p50_abs": None,
                "p90_abs": None, "max_abs": None, "nmae_pct": None}
    abs_e = e.abs()
    out = {
        "n": int(e.size),
        "mae": num(abs_e.mean()),
        "rmse": num(math.sqrt((e ** 2).mean())),
        "bias": num(e.mean()),
        "p50_abs": num(abs_e.quantile(0.5)),
        "p90_abs": num(abs_e.quantile(0.9)),
        "max_abs": num(abs_e.max()),
        "nmae_pct": None,
    }
    if actual is not None:
        mean_actual = pd.Series(actual, dtype="float64").loc[e.index].mean()
        if mean_actual and mean_actual > 0:
            out["nmae_pct"] = num(100 * abs_e.mean() / mean_actual)
    return out


# ----------------------------------------------------------------------------
# prepared data (computed once per dataset)
# ----------------------------------------------------------------------------
class Prepared:
    """Clean, indexed views of a Dataset plus a joined forecast-error table."""

    def __init__(self, ds: Dataset):
        f = ds.forecasts.copy()
        f["publish_time"] = _utc(f["publish_time"])
        f["start_time"] = _utc(f["start_time"])
        f["lead_h"] = (f["start_time"] - f["publish_time"]).dt.total_seconds() / 3600
        # keep genuine forecasts within the horizon we care about
        f = f[(f["lead_h"] >= 0) & (f["lead_h"] <= config.MAX_HORIZON_HOURS)]
        self.forecasts = f.sort_values("publish_time").reset_index(drop=True)

        a = ds.actuals.copy()
        a["start_time"] = _utc(a["start_time"])
        self.actuals = a.sort_values("start_time").drop_duplicates("start_time").reset_index(drop=True)
        self.actual_by_time = self.actuals.set_index("start_time")["generation"]

        # every forecast row paired with its outturn
        err = self.forecasts.merge(
            self.actuals[["start_time", "generation"]].rename(columns={"generation": "actual"}),
            on="start_time", how="inner")
        err["error"] = err["generation"] - err["actual"]
        self.errors = err

        self.publish_times = pd.DatetimeIndex(self.forecasts["publish_time"].unique()).sort_values()
        self.meta = ds.meta


_PREP_CACHE: dict[int, Prepared] = {}
_RESULT_CACHE: dict[tuple, Any] = {}


def prepare(ds: Dataset) -> Prepared:
    key = id(ds)
    if key not in _PREP_CACHE:
        _PREP_CACHE.clear()
        _RESULT_CACHE.clear()
        _PREP_CACHE[key] = Prepared(ds)
    return _PREP_CACHE[key]


def _cached(key: tuple, fn):
    if key not in _RESULT_CACHE:
        _RESULT_CACHE[key] = fn()
    return _RESULT_CACHE[key]


# ----------------------------------------------------------------------------
# forecast selection
# ----------------------------------------------------------------------------
def latest_forecasts(p: Prepared, targets: pd.Series, cutoffs: pd.Series | pd.Timestamp) -> pd.DataFrame:
    """For each target time, the most recent forecast published at or before its cutoff.

    Returns columns: start_time, publish_time, forecast, lead_h (NaN where none).
    """
    left = pd.DataFrame({"start_time": _utc(pd.Series(targets).reset_index(drop=True))})
    if isinstance(cutoffs, pd.Timestamp):
        left["cutoff"] = cutoffs.tz_convert("UTC")
    else:
        left["cutoff"] = _utc(pd.Series(cutoffs).reset_index(drop=True))
    left["cutoff"] = left["cutoff"].astype(NS_UTC)
    left = left.sort_values("cutoff")
    right = p.forecasts[["publish_time", "start_time", "generation", "lead_h"]]
    m = pd.merge_asof(left, right, left_on="cutoff", right_on="publish_time",
                      by="start_time", direction="backward")
    m = m.rename(columns={"generation": "forecast"}).sort_values("start_time").reset_index(drop=True)
    return m[["start_time", "publish_time", "forecast", "lead_h"]]


def forecast_at_horizon(p: Prepared, targets: pd.Series, horizon_h: float) -> pd.DataFrame:
    """Latest forecast published at least ``horizon_h`` hours before each target."""
    t = _utc(pd.Series(targets))
    return latest_forecasts(p, t, t - pd.Timedelta(hours=horizon_h))


def target_grid(p: Prepared, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Forecast target times in [start, end)."""
    ts = p.forecasts["start_time"]
    grid = ts[(ts >= start) & (ts < end)].drop_duplicates().sort_values()
    return grid.reset_index(drop=True)


# ----------------------------------------------------------------------------
# uncertainty band from history known at decision time
# ----------------------------------------------------------------------------
def error_history(p: Prepared, as_of: pd.Timestamp) -> pd.DataFrame:
    """Forecast errors that a trader could have computed at ``as_of``."""
    e = p.errors
    lookback = as_of - pd.Timedelta(days=config.ERROR_LOOKBACK_DAYS)
    mask = ((e["publish_time"] <= as_of)
            & (e["start_time"] + ACTUAL_PUBLISH_DELAY <= as_of)
            & (e["start_time"] >= lookback))
    return e.loc[mask, ["lead_h", "error"]]


def band_for_leads(history: pd.DataFrame, leads: pd.Series) -> pd.DataFrame:
    """Error statistics for each lead time, from recent errors at similar leads.

    Returns the P10/P90 error quantiles (for the likely range), the mean error
    (bias, used for the adjusted forecast) and the mean absolute error.
    """
    lo_q, hi_q = config.BAND_QUANTILES
    h_lead = history["lead_h"].to_numpy()
    h_err = history["error"].to_numpy()
    rows = []
    for lead in leads.to_numpy():
        if np.isnan(lead):
            rows.append((np.nan, np.nan, np.nan, np.nan, 0))
            continue
        sel = h_err[np.abs(h_lead - lead) <= config.LEAD_MATCH_HOURS]
        if sel.size < 20:
            rows.append((np.nan, np.nan, np.nan, np.nan, int(sel.size)))
            continue
        rows.append((np.quantile(sel, lo_q), np.quantile(sel, hi_q), float(np.mean(sel)),
                     float(np.mean(np.abs(sel))), int(sel.size)))
    return pd.DataFrame(rows, columns=["err_lo", "err_hi", "bias_at_lead", "mae_at_lead", "n_hist"])


# ----------------------------------------------------------------------------
# day-ahead decision view
# ----------------------------------------------------------------------------
def decision_frame(p: Prepared, decision_day: date, gate: time) -> tuple[pd.DataFrame, pd.Timestamp]:
    """Point-level table for one decision: forecast, band and (hindsight) actual."""
    tau = uk_datetime(decision_day, gate)
    start, end = delivery_window(decision_day)
    targets = target_grid(p, start, end)
    df = latest_forecasts(p, targets, tau)
    band = band_for_leads(error_history(p, tau), df["lead_h"])
    df = pd.concat([df, band], axis=1)
    # error = forecast - actual  =>  actual = forecast - error
    df["p10"] = (df["forecast"] - df["err_hi"]).clip(lower=0)
    df["p90"] = (df["forecast"] - df["err_lo"]).clip(lower=0)
    # bias-adjusted: remove the average lean seen recently at this lead time
    df["adjusted"] = (df["forecast"] - df["bias_at_lead"]).clip(lower=0)
    df["actual"] = df["start_time"].map(p.actual_by_time)
    df["error"] = df["forecast"] - df["actual"]
    df["adjusted_error"] = df["adjusted"] - df["actual"]
    inside = (df["actual"] >= df["p10"]) & (df["actual"] <= df["p90"])
    df["in_band"] = inside.astype("float64").where(df["actual"].notna() & df["p10"].notna())
    return df, tau


def _previous_runs(p: Prepared, latest_publish: pd.Timestamp, targets: pd.Series) -> list[dict]:
    """The forecast runs from roughly 6, 12 and 24 hours before the latest one."""
    runs = []
    pubs = p.publish_times
    for offset in (6, 12, 24):
        wanted = latest_publish - pd.Timedelta(hours=offset)
        older = pubs[pubs <= wanted]
        if len(older) == 0:
            continue
        pub = older.max()
        if any(r["publish_time"] == iso(pub) for r in runs):
            continue
        run = p.forecasts[(p.forecasts["publish_time"] == pub)
                          & (p.forecasts["start_time"].isin(targets))].sort_values("start_time")
        if len(run) < 0.5 * len(targets):
            continue
        runs.append({
            "publish_time": iso(pub),
            "hours_before_latest": num((latest_publish - pub).total_seconds() / 3600),
            "points": [{"t": iso(r.start_time), "forecast": num(r.generation)}
                       for r in run.itertuples()],
        })
    return runs


def decision_view(ds: Dataset, decision_day: date, gate: time) -> dict:
    p = prepare(ds)
    return _cached(("decision", id(ds), decision_day, gate),
                   lambda: _decision_view(p, decision_day, gate))


def _decision_view(p: Prepared, decision_day: date, gate: time) -> dict:
    df, tau = decision_frame(p, decision_day, gate)
    start, end = delivery_window(decision_day)
    have = df.dropna(subset=["forecast"])
    step = step_hours(df["start_time"]) if len(df) else 1.0

    latest_pub = have["publish_time"].max() if len(have) else None
    runs_used = sorted({iso(t) for t in have["publish_time"].dropna()})

    def energy(col: str) -> float | None:
        s = have[col].dropna()
        return num(s.sum() * step, 0) if len(s) == len(have) and len(s) else None

    summary: dict[str, Any] = {
        "points": int(len(df)),
        "points_with_forecast": int(len(have)),
        "step_hours": step,
        "latest_publish_time": iso(latest_pub),
        "forecast_age_hours": num((tau - latest_pub).total_seconds() / 3600, 2) if latest_pub is not None else None,
        "lead_range_hours": [num(have["lead_h"].min()), num(have["lead_h"].max())] if len(have) else None,
        "energy_mwh": {"p50": energy("forecast"), "p10": energy("p10"), "p90": energy("p90"),
                       "adjusted": energy("adjusted")},
        "mean_mw": num(have["forecast"].mean(), 0) if len(have) else None,
        "peak": None, "trough": None,
        "typical_mae_mw": num(have["mae_at_lead"].mean(), 0) if have["mae_at_lead"].notna().any() else None,
        "typical_bias_mw": num(have["bias_at_lead"].mean(), 0) if have["bias_at_lead"].notna().any() else None,
        "history_samples": int(have["n_hist"].min()) if len(have) else 0,
    }
    if len(have):
        pk = have.loc[have["forecast"].idxmax()]
        tr = have.loc[have["forecast"].idxmin()]
        summary["peak"] = {"t": iso(pk.start_time), "mw": num(pk.forecast, 0)}
        summary["trough"] = {"t": iso(tr.start_time), "mw": num(tr.forecast, 0)}

    hind = have.dropna(subset=["actual"])
    hindsight = None
    if len(hind):
        m = metrics(hind["error"], hind["actual"])
        f_e, a_e = hind["forecast"].sum() * step, hind["actual"].sum() * step
        cov = hind["in_band"].dropna()
        hindsight = {
            **m,
            "complete": len(hind) == len(have),
            "actual_energy_mwh": num(a_e, 0),
            "energy_error_mwh": num(f_e - a_e, 0),
            "energy_error_pct": num(100 * (f_e - a_e) / a_e) if a_e else None,
            "band_coverage_pct": num(100 * cov.astype(float).mean()) if len(cov) else None,
            "adjusted_mae": metrics(hind["adjusted_error"])["mae"],
            "adjusted_energy_error_mwh": num(hind["adjusted_error"].sum() * step, 0)
            if hind["adjusted_error"].notna().all() else None,
        }

    points = [{
        "t": iso(r.start_time),
        "forecast": num(r.forecast),
        "p10": num(r.p10),
        "p90": num(r.p90),
        "adjusted": num(r.adjusted),
        "actual": num(r.actual),
        "publish_time": iso(r.publish_time),
        "lead_h": num(r.lead_h),
    } for r in df.itertuples()]

    return {
        "decision_day": decision_day.isoformat(),
        "decision_time": iso(tau),
        "delivery_start": iso(start),
        "delivery_end": iso(end),
        "runs_used": runs_used,
        "summary": summary,
        "hindsight": hindsight,
        "points": points,
        "previous_runs": _previous_runs(p, latest_pub, df["start_time"]) if latest_pub is not None else [],
    }


# ----------------------------------------------------------------------------
# accuracy across the whole decision month
# ----------------------------------------------------------------------------
def decision_days() -> list[date]:
    d, out = config.FIRST_DECISION_DAY, []
    while d <= config.LAST_DECISION_DAY:
        out.append(d)
        d += timedelta(days=1)
    return out


def accuracy_report(ds: Dataset, gate: time) -> dict:
    p = prepare(ds)
    return _cached(("accuracy", id(ds), gate), lambda: _accuracy_report(p, gate))


def _accuracy_report(p: Prepared, gate: time) -> dict:
    frames = []
    for d in decision_days():
        df, _ = decision_frame(p, d, gate)
        df["decision_day"] = d.isoformat()
        frames.append(df)
    all_pts = pd.concat(frames, ignore_index=True)
    scored = all_pts.dropna(subset=["forecast", "actual"])
    step = step_hours(all_pts["start_time"]) if len(all_pts) else 1.0

    daily = []
    for d, g in scored.groupby("decision_day", sort=True):
        m = metrics(g["error"], g["actual"])
        f_e, a_e = g["forecast"].sum() * step, g["actual"].sum() * step
        cov = g["in_band"].dropna()
        adj_e = g["adjusted_error"].dropna()
        daily.append({
            "decision_day": d,
            "delivery_day": (date.fromisoformat(d) + timedelta(days=1)).isoformat(),
            **m,
            "forecast_energy_mwh": num(f_e, 0),
            "actual_energy_mwh": num(a_e, 0),
            "energy_error_mwh": num(f_e - a_e, 0),
            "energy_error_pct": num(100 * (f_e - a_e) / a_e) if a_e else None,
            "band_coverage_pct": num(100 * cov.astype(float).mean()) if len(cov) else None,
            "adjusted_mae": num(adj_e.abs().mean()) if len(adj_e) else None,
            "adjusted_energy_error_mwh": num(adj_e.sum() * step, 0) if len(adj_e) == len(g) else None,
        })

    overall = metrics(scored["error"], scored["actual"])
    cov = scored["in_band"].dropna()
    overall["band_coverage_pct"] = num(100 * cov.astype(float).mean()) if len(cov) else None
    overall["days"] = len(daily)
    if daily:
        with_mae = [x for x in daily if x["mae"] is not None]
        worst = max(with_mae, key=lambda x: x["mae"])
        best = min(with_mae, key=lambda x: x["mae"])
        overall["worst_day"] = {"delivery_day": worst["delivery_day"], "mae": worst["mae"]}
        overall["best_day"] = {"delivery_day": best["delivery_day"], "mae": best["mae"]}
        overall["days_over_forecast"] = sum(1 for x in daily if (x["energy_error_mwh"] or 0) > 0)
        energy_errs = [abs(x["energy_error_pct"]) for x in daily if x["energy_error_pct"] is not None]
        overall["median_abs_energy_error_pct"] = num(float(np.median(energy_errs))) if energy_errs else None

    # How the bias-adjusted forecast would have done over the same decisions.
    adj = scored.dropna(subset=["adjusted_error"])
    adjusted = metrics(adj["adjusted_error"], adj["actual"])
    adj_daily = [100 * g["adjusted_error"].sum() / g["actual"].sum()
                 for _, g in adj.groupby("decision_day") if g["actual"].sum() > 0]
    adjusted["median_abs_energy_error_pct"] = num(float(np.median(np.abs(adj_daily)))) if adj_daily else None
    overall["adjusted"] = adjusted

    # error by UK hour of day
    local_hour = scored["start_time"].dt.tz_convert(config.UK_TZ).dt.hour
    by_hour = []
    for h, g in scored.groupby(local_hour):
        m = metrics(g["error"])
        by_hour.append({"hour": int(h), "mae": m["mae"], "bias": m["bias"], "n": m["n"]})

    # error histogram
    hist = []
    if len(scored):
        e = scored["error"].to_numpy()
        width = 500.0
        lo = math.floor(e.min() / width) * width
        hi = math.ceil(e.max() / width) * width + width
        counts, edges = np.histogram(e, bins=np.arange(lo, hi + 1, width))
        hist = [{"from": num(edges[i], 0), "to": num(edges[i + 1], 0), "count": int(c)}
                for i, c in enumerate(counts)]

    return {
        "gate_closure": gate.strftime("%H:%M"),
        "step_hours": step,
        "summary": overall,
        "daily": daily,
        "by_hour": by_hour,
        "histogram": hist,
        "by_horizon": horizon_curve(p),
    }


def horizon_curve(p: Prepared, max_h: int = config.MAX_HORIZON_HOURS) -> list[dict]:
    """Error statistics against forecast horizon, over all January delivery days."""
    start, _ = delivery_window(config.FIRST_DECISION_DAY)
    _, end = delivery_window(config.LAST_DECISION_DAY)
    targets = target_grid(p, start, end)
    targets = targets[targets.isin(p.actual_by_time.index)]
    out = []
    for h in range(0, max_h + 1):
        f = forecast_at_horizon(p, targets, h).dropna(subset=["forecast"])
        f["actual"] = f["start_time"].map(p.actual_by_time)
        f["error"] = f["forecast"] - f["actual"]
        m = metrics(f["error"], f["actual"])
        if m["n"]:  # the longest horizons can have no forecasts at all
            out.append({"horizon_h": h, **m})
    return out


# ----------------------------------------------------------------------------
# explorer: actual vs forecast at a fixed horizon
# ----------------------------------------------------------------------------
def series_view(ds: Dataset, start: pd.Timestamp, end: pd.Timestamp, horizon_h: float) -> dict:
    p = prepare(ds)
    a = p.actuals[(p.actuals["start_time"] >= start) & (p.actuals["start_time"] < end)]
    targets = target_grid(p, start, end)
    f = forecast_at_horizon(p, targets, horizon_h).dropna(subset=["forecast"])
    f["actual"] = f["start_time"].map(p.actual_by_time)
    f["error"] = f["forecast"] - f["actual"]
    return {
        "start": iso(start), "end": iso(end), "horizon_h": horizon_h,
        "actual": [{"t": iso(r.start_time), "mw": num(r.generation)} for r in a.itertuples()],
        "forecast": [{"t": iso(r.start_time), "mw": num(r.forecast), "publish_time": iso(r.publish_time),
                      "lead_h": num(r.lead_h)} for r in f.itertuples()],
        "metrics": metrics(f["error"], f["actual"]),
    }


# ----------------------------------------------------------------------------
# metadata
# ----------------------------------------------------------------------------
def meta(ds: Dataset) -> dict:
    p = prepare(ds)
    f, a = p.forecasts, p.actuals
    runs = pd.Series(p.publish_times, dtype=NS_UTC)
    gaps = runs.diff().dropna().dt.total_seconds() / 3600 if len(runs) > 1 else pd.Series(dtype=float)
    start, _ = delivery_window(config.FIRST_DECISION_DAY)
    _, end = delivery_window(config.LAST_DECISION_DAY)
    return {
        "source": p.meta.get("source", "unknown"),
        "fetched_at": p.meta.get("fetched_at"),
        "decision_days": [d.isoformat() for d in decision_days()],
        "default_gate_closure": config.DEFAULT_GATE_CLOSURE.strftime("%H:%M"),
        "explore_window": {"start": iso(start), "end": iso(end)},
        "max_horizon_h": config.MAX_HORIZON_HOURS,
        "error_lookback_days": config.ERROR_LOOKBACK_DAYS,
        "band_quantiles": list(config.BAND_QUANTILES),
        "forecast_runs": int(len(runs)),
        "median_hours_between_runs": num(gaps.median(), 2) if len(gaps) else None,
        "forecast_rows": int(len(f)),
        "actual_rows": int(len(a)),
        "actuals_range": [iso(a["start_time"].min()), iso(a["start_time"].max())] if len(a) else None,
        "forecast_publish_range": [iso(runs.min()), iso(runs.max())] if len(runs) else None,
    }
