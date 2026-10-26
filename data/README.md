# Data snapshot

The app reads three files from this folder at startup:

| File | Contents |
| --- | --- |
| `actuals_wind.csv` | FUELHH outturn, fuelType WIND: `start_time`, `publish_time`, `generation` (MW) |
| `forecasts_wind.csv` | WINDFOR forecasts: `publish_time`, `start_time`, `generation` (MW) |
| `meta.json` | Source, fetch time, date ranges and row counts |

Create or refresh them with:

```bash
python backend/scripts/fetch_data.py
```

If the files are missing, the API fetches the same data from Elexon on its first request and caches it
here (or in `/tmp/windesk-cache` when this folder is read-only, as on Vercel).

All timestamps are UTC (ISO 8601).
