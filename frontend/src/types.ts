// Response shapes of the FastAPI backend (see backend/app/analytics.py).

export interface Metrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  p50_abs: number | null;
  p90_abs: number | null;
  max_abs: number | null;
  nmae_pct: number | null;
}

export interface Meta {
  source: string;
  fetched_at: string | null;
  decision_days: string[];
  default_gate_closure: string;
  explore_window: { start: string; end: string };
  max_horizon_h: number;
  error_lookback_days: number;
  band_quantiles: [number, number];
  forecast_runs: number;
  median_hours_between_runs: number | null;
  forecast_rows: number;
  actual_rows: number;
  actuals_range: [string, string] | null;
  forecast_publish_range: [string, string] | null;
}

export interface DecisionPoint {
  t: string;
  forecast: number | null;
  p10: number | null;
  p90: number | null;
  actual: number | null;
  publish_time: string | null;
  lead_h: number | null;
}

export interface PreviousRun {
  publish_time: string;
  hours_before_latest: number;
  points: { t: string; forecast: number | null }[];
}

export interface Decision {
  decision_day: string;
  decision_time: string;
  delivery_start: string;
  delivery_end: string;
  runs_used: string[];
  summary: {
    points: number;
    points_with_forecast: number;
    step_hours: number;
    latest_publish_time: string | null;
    forecast_age_hours: number | null;
    lead_range_hours: [number, number] | null;
    energy_mwh: { p50: number | null; p10: number | null; p90: number | null };
    mean_mw: number | null;
    peak: { t: string; mw: number } | null;
    trough: { t: string; mw: number } | null;
    typical_mae_mw: number | null;
    history_samples: number;
  };
  hindsight:
    | (Metrics & {
        complete: boolean;
        actual_energy_mwh: number | null;
        energy_error_mwh: number | null;
        energy_error_pct: number | null;
        band_coverage_pct: number | null;
      })
    | null;
  points: DecisionPoint[];
  previous_runs: PreviousRun[];
}

export interface DailyAccuracy extends Metrics {
  decision_day: string;
  delivery_day: string;
  forecast_energy_mwh: number | null;
  actual_energy_mwh: number | null;
  energy_error_mwh: number | null;
  energy_error_pct: number | null;
  band_coverage_pct: number | null;
}

export interface Accuracy {
  gate_closure: string;
  step_hours: number;
  summary: Metrics & {
    band_coverage_pct: number | null;
    days: number;
    worst_day?: { delivery_day: string; mae: number };
    best_day?: { delivery_day: string; mae: number };
    days_over_forecast?: number;
    median_abs_energy_error_pct?: number | null;
  };
  daily: DailyAccuracy[];
  by_hour: { hour: number; mae: number | null; bias: number | null; n: number }[];
  histogram: { from: number; to: number; count: number }[];
  by_horizon: (Metrics & { horizon_h: number })[];
}

export interface Series {
  start: string;
  end: string;
  horizon_h: number;
  actual: { t: string; mw: number | null }[];
  forecast: { t: string; mw: number | null; publish_time: string; lead_h: number }[];
  metrics: Metrics;
}
