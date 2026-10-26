# Wind Desk

A web app for a UK utility's day-ahead power desk. It answers two questions for every purchase decision
made in January 2026:

1. **What is the latest wind forecast I can use right now?** For a chosen decision day and gate closure
   time, it shows the most recent national wind forecast published before gate closure, for the whole
   next delivery day, with an uncertainty range and the volume left to buy against your demand.
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
cd backend && pytest          # 25 tests: selection logic, no-lookahead guarantees, metrics, API, ingestion
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

## What the app does

### Day-ahead brief

- Pick a decision day (1 to 31 January 2026) and gate closure time (default **09:50 UK**, when the
  GB day-ahead auction closes).
- The timeline strip shows when the forecast run was published, gate closure, and the delivery day
  (00:00 to 24:00 UK the following day).
- Headline: expected wind energy for the delivery day, with a low and high case.
- Chart: latest forecast, an 80% likely range (P10 to P90), the runs from roughly 6, 12 and 24 hours
  earlier (to show how the forecast has been moving), and, optionally, the actual outturn in hindsight.
- Volume left to buy: enter a demand figure and see the energy still to procure, expected and if wind
  comes in low.
- Hourly table with CSV download.

### Forecast accuracy

- Summary of all 31 January decisions at the chosen gate closure: average miss (MAE), RMSE, bias,
  1-in-10 miss, median daily energy miss, and how often outturn landed inside the likely range.
- Plain-language takeaways generated from the numbers.
- Error against forecast horizon (0 to 48 h), with the lead times used at day-ahead gate closure shaded.
- Energy miss per delivery day (click a bar to open that day's brief), error by hour of day, and the
  error distribution.

### Explorer

Actual wind against the forecast made at least *N* hours earlier, for any date range in the January
delivery period, with a 0 to 48 hour horizon slider.

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
│   ├── ARCHITECTURE.md        Design notes for technical review
│   └── VIDEO_SCRIPT.md        Outline for the two-part demo video
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
