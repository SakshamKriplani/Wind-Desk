# Wind Desk

A web app for a UK utility's day-ahead power desk. It answers two questions for every purchase decision
made in January 2026:

1. **What is the latest wind forecast I can use right now?** For a chosen decision day and gate closure
   time, it shows the most recent national wind forecast published before gate closure, for the whole
   next delivery day, with an uncertainty range, a bias-adjusted figure and the volume left to buy
   against your demand.
2. **How far can I trust it?** It measures how accurate those gate-closure forecasts were across all 31
   January decisions, and how forecast error grows with horizon from 0 to 48 hours.

Data: Elexon BMRS, national level only. Outturn from
[FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) (fuelType WIND) and
forecasts from [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream).

**Live app:** `<add your Vercel or Heroku URL here>`
**Video walkthrough:** `<add your unlisted YouTube URL here>`

---

## Quick start

### With Docker (recommended)

```bash
docker compose up --build
```

Open http://localhost:8000. If you skip the fetch step, the app downloads the data from Elexon on its
first request (about 30 to 60 seconds) and caches it in `./data`. To create the snapshot ahead of time,
run `python backend/scripts/fetch_data.py` after `pip install -r requirements.txt`.

### Without Docker

Requires Python 3.11+ and Node 20.19+.

```bash
# backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r backend/requirements-dev.txt
python backend/scripts/fetch_data.py                  # one-off data snapshot
cd backend && uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to port 8000.
API docs are at http://localhost:8000/docs.

### Tests

```bash
cd backend && pytest          # 26 tests: selection logic, no-lookahead guarantees, metrics, API, ingestion
cd frontend && npm test       # formatting helpers
```

---

## Deploying

### Vercel

`vercel.json` builds the React app as static files and runs the API as a Python serverless function
(`api/index.py`). Commit the `data/` snapshot first so the function does not need to call Elexon on a
cold start.

```bash
npm i -g vercel
vercel --prod
```

### Heroku

`heroku.yml` builds the same Docker image used locally.

```bash
heroku create
heroku stack:set container
git push heroku main
```

---

## Requirements and how the app meets them

The brief sets two requirements. Everything else in the app either serves one of them or is listed
under "Added beyond the brief" with the reason it is there.

| Requirement (from the brief) | Where it is met |
| --- | --- |
| Understand how much power must be procured beyond wind | **Day-ahead brief > Volume left to buy**: demand minus expected wind, as published, bias-adjusted and in a low-wind case. |
| Decisions are made one day before delivery | Each decision day D buys for D+1 (00:00 to 24:00 UK). The timeline strip shows decision day, gate closure and delivery day. |
| 1. Clearly understand the **latest** forecast **available when the decision is made** | **Day-ahead brief**: for each delivery period, the latest WINDFOR value published at or before gate closure (`latest_forecasts()` in `analytics.py`). The page is framed as the gate-closure screen; anything known only later is hidden by default. |
| 2. Evaluate forecast accuracy **quantitatively** | **Forecast accuracy**: MAE, RMSE, bias, normalised MAE, 1-in-10 miss, daily energy miss, all over the 31 January decisions, plus error against horizon from 0 to 48 h. |
| ...so decisions can be made **considering the quantified error** | The measured error flows back into the brief: a callout states the recent bias at this lead time and the bias-adjusted wind figure; the chart shows the bias-adjusted line and the likely range; the volume panel gives the bias-adjusted volume to buy. The accuracy view shows how much this adjustment would have helped across January. |
| Data: FUELHH (WIND) and WINDFOR only, for January 2026 decisions | `elexon.py` and `store.py`. No other data source is used. |
| React frontend, Python backend, Docker, Vercel or Heroku | React + TypeScript (Vite), FastAPI + pandas, `Dockerfile` and `docker-compose.yml`, `vercel.json` and `heroku.yml`. |

### Added beyond the brief, and why

| Addition | Why |
| --- | --- |
| Gate closure default of 09:50 UK | The brief says "one day before delivery" but not when. 09:50 UK is when the Nord Pool GB day-ahead auction closes. It is adjustable in the UI because other venues and internal cut-offs differ. |
| Likely range (P10 to P90) | A single number hides risk. The range is built only from errors already observed at gate closure, so it is honest about what the desk could have known. In January it held outturn 80% of the time, matching its target. |
| Bias-adjusted forecast | The accuracy analysis showed a large, consistent lean. Removing the bias seen in the previous 14 days is the simplest way to act on the quantified error. |
| Earlier forecast runs on the chart | Shows whether the forecast has been moving between runs, a common question before committing volume. |
| "What actually happened" (off by default) | Lets the client judge any single day. It is hindsight, so it is hidden unless asked for and never used in a decision. |
| Error by hour of day, error distribution, daily energy misses, plain-language takeaways | Different cuts of requirement 2 for different readers: when in the day the forecast is weakest, how skewed errors are, which days hurt, and a summary a non-analyst can act on. |
| Explorer view | Not a requirement. A tool for ad-hoc checks of actual against forecast at any horizon and date range. |
| Error history from mid-December | The range and bias for 1 January decisions need 14 days of prior errors. This data is used only as history, never scored. |

---

## Findings from January 2026

At 09:50 gate closure, over the 31 January decisions:

- The forecast missed by **about 2.0 GW per hour on average** (18% of average wind output). RMSE was
  2.5 GW and one hour in ten missed by more than 4.2 GW.
- The miss was **mostly one-directional**: the forecast ran 1.7 GW above outturn on average, and
  wind under-delivered on 27 of 31 delivery days. A buyer relying on the forecast as published would
  usually have been short.
- **Lead time matters less than the bias.** The 24-hour-ahead miss (1.93 GW) is only modestly worse
  than the 1-hour-ahead miss (1.68 GW), and consecutive runs differ by only about 0.3 GW on average.
  The error is mostly a systematic offset, not forecast noise.
- **Correcting for the bias seen in the previous 14 days**, using only data known at gate closure,
  would have cut the average miss to **1.48 GW (26% lower)** and the median daily energy miss from
  13.0% to 7.4%.
- The 80% likely range contained outturn 80% of the time, so it is a fair guide to risk.

A possible cause of the offset, not tested here: FUELHH records metered output, which is reduced when
wind farms are turned down for network constraints, while the forecast may describe generation before
those actions. Confirming this would need data outside the brief's scope.

---

## Method and assumptions

| Topic | Choice |
| --- | --- |
| Decision days | 1 to 31 January 2026 (UK dates). Each buys for the next day, so deliveries run 2 Jan to 1 Feb. |
| Gate closure | 09:50 UK by default (Nord Pool GB day-ahead auction). Adjustable in the UI. |
| Delivery day | 00:00 to 24:00 UK time on D+1. |
| Forecast used for a decision | For each target time, the latest WINDFOR value published at or before gate closure. |
| Forecast at horizon *h* | For target time *T*, the latest forecast published at or before *T − h*. |
| Horizon cap | Forecasts more than 48 h ahead of their target are ignored; forecasts published after their target are dropped. |
| Error sign | error = forecast − actual. Positive means wind came in below forecast, so a buyer relying on it is short. |
| Bias adjustment | Mean error from the same 14-day, ±3 h lead-time history, subtracted from each forecast value. |
| Likely range | Empirical 10th and 90th percentiles of errors from the previous 14 days, at lead times within ±3 h of each target's lead, using only forecasts and outturn known at gate closure. |
| Joining | Forecasts are matched to outturn on `startTime`. Outturn re-publications keep the latest value. |
| Data window | Outturn from 15 Dec 2025 and forecasts from 13 Dec 2025 feed the 14-day error history for early-January decisions. Nothing after gate closure is used in a decision; later data is only used to score it. |
| Daily low/high energy | Sum of hourly P10 or P90 values. This assumes every hour lands at the same end of its range, so it is a deliberately wide bound. |

The no-lookahead rule is enforced by `backend/tests/test_no_lookahead.py`, which scrambles all data
published after gate closure and checks the decision output does not change.

---

## Repository layout

```
.
├── api/
│   └── index.py               Vercel serverless entry point (wraps the FastAPI app)
├── backend/
│   ├── app/
│   │   ├── config.py          Study window, gate closure, analysis settings, paths
│   │   ├── elexon.py          Elexon client: chunked requests, retries, normalisation
│   │   ├── store.py           Loads the CSV snapshot, or fetches live and caches it
│   │   ├── analytics.py       Forecast selection, uncertainty range, decision view, accuracy metrics
│   │   └── main.py            FastAPI routes; also serves the built frontend in production
│   ├── scripts/
│   │   └── fetch_data.py      Downloads the study data into data/
│   ├── tests/                 pytest suite (synthetic data generator in synthetic.py)
│   ├── pytest.ini
│   └── requirements-dev.txt   Runtime plus test dependencies
├── data/                      CSV snapshot of the Elexon data (see data/README.md)
├── docs/
│   └── ARCHITECTURE.md        Design notes for technical review
├── frontend/
│   ├── src/
│   │   ├── App.tsx            Shell, navigation, hash routing
│   │   ├── api.ts             Typed API client
│   │   ├── types.ts           Response types matching the backend
│   │   ├── format.ts          Number, time (UK) and CSV helpers, with tests
│   │   ├── hooks.ts           useAsync data-loading hook
│   │   ├── components/        Decision timeline, figures row, tooltip, status messages
│   │   ├── views/             BriefView, AccuracyView, ExploreView
│   │   └── styles.css         Design tokens and layout (light and dark)
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── .github/workflows/ci.yml   Backend tests, frontend tests and build, Docker build
├── Dockerfile                 Multi-stage: builds React, then runs the API with the built app
├── docker-compose.yml
├── heroku.yml
├── vercel.json
└── requirements.txt           Python runtime dependencies
```

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/meta` | Data source, coverage, decision days, defaults |
| `GET /api/decision?date=2026-01-15&gate=09:50` | Day-ahead brief for one decision |
| `GET /api/accuracy?gate=09:50` | Month-wide accuracy report, including error by horizon |
| `GET /api/series?start=2026-01-05&end=2026-01-08&horizon=4` | Actual and forecast at a fixed horizon |
| `GET /api/health` | Liveness check |

---

## Use of AI tools

Claude (Anthropic) was used as an AI coding assistant on this project, for scaffolding, implementation,
tests and documentation.
