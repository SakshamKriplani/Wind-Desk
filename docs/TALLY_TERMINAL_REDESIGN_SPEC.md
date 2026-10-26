# Wind Desk — TallyPrime Enterprise Terminal Redesign Specification
> **Prompt & Implementation Blueprint for Claude**  
> *Transforming Wind Desk from a static web dashboard into an ultra-dense, reactive, TallyPrime-inspired Energy Trading Terminal.*

---

## 1. Vision & Core Philosophy

The goal is to overhaul Wind Desk into **"WindDesk Prime"**: a high-density, mission-critical energy trading and dispatch workstation inspired directly by **TallyPrime Gold / Silver**.

### What Makes It Feel "Live" (Not Static):
1. **Zero-Latency Reactive Calculations:** As soon as the user adjusts a slider, gate closure time, risk threshold, or volume hedge input, all downstream numbers (imbalance exposure, bias-adjusted curves, expected cashout penalty, P10/P90 bands) update **instantly** with animated delta indicators (`+14.2 MWh ▲`, `-£2,450 ▼`).
2. **Dynamic Live Micro-Interactions:** Small inline reload buttons (`⟳ Refresh Run`, `⚡ Recalc`, `⌥ Auto-Hedge`) next to inputs and table rows that flash a subtle recalculation spinner and update simulated telemetry.
3. **High Data Density & Enterprise Ledger Aesthetic:** Monospaced tabular figures, multi-tier data grids, group collapsible ledgers, active yellow/amber selection bars, and quick-filter hotkey buttons along the right rail (`F2: Period`, `F3: Gate`, `F5: Detailed`, etc.).

---

## 2. Visual Design System (TallyPrime Aesthetic)

### 2.1 Color Palette
* **Master Header Navy:** `#0c3a6b` (Classic Tally Navy Blue)
* **Sub-Header / Breadcrumb Blue:** `#1d5a99`
* **Right Hotkey Action Rail:** `#e4f1fb` (Soft Tally Cyan/Ice Blue) with `#0b3a6d` text
* **Active Selection Highlight (The Signature Tally Bar):** `#f8b819` (Warm Golden Amber) with `#000000` bold text
* **Table Row Hover / Alternate:** `#f4f8fc` / `#ffffff`
* **Grid Lines & Borders:** `#b9d5ee` and `#d2e3f3`
* **Positive / Inwards / Surplus:** `#107c41` (Deep Forest Green)
* **Negative / Outwards / Deficit / Cashout Penalty:** `#c5221f` (Tally Red)
* **Forecast Line / Primary Bar:** `#3b95d6` (Tally Sky Blue)
* **Adjusted / Actual Line:** `#0e3e78` (Deep Blue) / `#e67e22` (Orange)

### 2.2 Typography
* **Font Family:** Consolas, Menlo, Monaco, `'Segoe UI Mono'`, monospace for all numerical tables, ledgers, and coordinates; `'Segoe UI'`, -apple-system, sans-serif for UI labels and headers.
* **Font Sizing & Weight:** Compact 11px–12.5px dense layout with uppercase column headers (`ITEM NAME`, `GATE TIME`, `P10 (MW)`, `P90 (MW)`, `NET EXPOSURE (£)`). All numbers must use `font-variant-numeric: tabular-nums`.

---

## 3. Global Terminal Layout & Shell

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┬─────────────────┐
│ TallyPrime WIND-DESK GOLD   [ G: Go To (Alt+G) ]  [ ⚡ Live Recalc: ON ]  [ ⟳ Tick: 10s ]   │ F2: Date / Gate │
├─────────────────────────────────────────────────────────────────────────────────────────────┤ F3: View Mode   │
│ WindDesk > Day-Ahead Trading Ledger > Delivery: 2026-01-16 [Gate: 09:50 GMT]                │ F4: Re-Simulate │
├─────────────────────────────────────────────────────────────────────────────────────────────┤ F5: Detailed    │
│                                                                                             │ F6: Imbalance   │
│   [ MAIN VIEWPORT: INTERACTIVE INPUTS, LIVE CHARTS & DENSE LEDGER TABLES ]                  │ F7: Bias Adj.   │
│                                                                                             │ F8: Export CSV  │
│                                                                                             │─────────────────│
│                                                                                             │ B: Basis Values │
│                                                                                             │ H: Change View  │
│                                                                                             │ L: Save Scenario│
│                                                                                             │ F12: Configure  │
├─────────────────────────────────────────────────────────────────────────────────────────────┴─────────────────┤
│ Q: Quit | ← Prev Tile | → Next Tile | Space: Select Row | Enter: Drilldown | Esc: Back       1,920 × 1,080    │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Top Navigation Bar (Tally Prime Master Bar)
* Left: **`TallyPrime`** logo with yellow **`WIND-DESK GOLD`** badge.
* Center: Search / Jump bar: `[ 🔍 Find forecasts, delivery dates, or settlement periods... (Alt+G) ]` with quick jump dialog.
* Action Pills:
  * `K: Settlement Day` (`2026-01-16`)
  * `Y: Gate Closure` (`09:50 UK`)
  * `Z: Risk Tolerance` (`P10 Conservative`)
  * `O: Import Actuals`
  * `E: Export Blotter`
  * `M: Simulate Jitter` (Inject live market volatility)
  * `F1: Help / Docs`

### 3.2 Right Function Key Action Rail (Tally F-Bar)
A persistent vertical sidebar on the right displaying keyboard shortcut tiles:
* **`F2: Period / Date`** — Opens inline date-picker modal
* **`F3: Gate Time`** — Cycle between `09:20`, `09:50`, `11:00`, `12:00`
* **`F5: Detailed / Condensed`** — Toggles table rows from 24 hourly to 48 half-hourly Settlement Periods (Elexon SP 1–48)
* **`F6: Imbalance Stress Test`** — Simulates +/- 20% wind drop and live cashout price spikes
* **`F7: Bias Correction`** — Toggles raw forecast vs. recent bias-adjusted hedge volume
* **`B: Basis of Values`** — Toggle between MWh, MW capacity factor %, and £ Sterling value
* **`H: Change View`** — Switch between Brief, Ledger, Accuracy Matrix, and Scenario Sandbox
* **`F12: Configure`** — Opens trading parameters drawer (imbalance penalty rate, bandwidth quantiles)

---

## 4. Multi-Page Architecture & Routes

Transform the app into 4 rich, feature-packed screens:

### Route 1: `/terminal/brief` (The Day-Ahead Trading Dashboard)
Inspired by **Screenshot 1 (Tally Dashboard - My View)**:
* **Top Metric Ribbon:**
  * `Total Expected Wind (P50)`: `184,210 MWh`
  * `Conservative Floor (P10)`: `142,800 MWh`
  * `High Ceiling (P90)`: `215,640 MWh`
  * `Hedge Recommendation`: `156,000 MWh` (with `[⚡ Auto-Fill]` button)
* **Interactive Control Strip:**
  * Sliders & Number inputs:
    * `Decision Day` & `Gate Time` (e.g., `09:50`)
    * `Risk Aversion Slider (0% aggressive P50 → 100% conservative P10)`
    * `Cashout Penalty Rate (£/MWh)` (default `£85.00`)
    * Small inline `[⟳ Recalculate]` button next to each input that triggers visual calculating pulses.
* **Tile Grid (2x2 or 3x2 Matrix):**
  * **Tile 1: Generation Profile (Interactive Line/Area Chart):**
    * Plots Raw Forecast (dashed sky blue), Bias-Adjusted (solid navy), P10–P90 Cloud (soft blue fill), and Actual Outturn toggle.
    * Live cursor scrub showing instantaneous delta.
  * **Tile 2: Purchase vs. Cashout Breakdown (Bar Chart):**
    * Bar comparison: Contracted Volume vs. Expected Outturn vs. Cashout Exposure.
  * **Tile 3: Settlement Ledger (Dense Table):**
    * 48 Settlement Periods table.
    * Clicking any row highlights it in **Tally Amber (`#f8b819`)** and drills down into the hourly weather run.

---

### Route 2: `/terminal/ledger` (Settlement Period Blotter & Voucher Register)
Inspired by **Screenshot 4 (GSTR-2B Reconciliation / Voucher Register)**:
* A full-screen, ultra-dense trading book table for all 48 UK settlement periods (00:00 to 24:00 GMT):
  * **Columns:**
    1. `SP` (Settlement Period 1–48)
    2. `Time Slot` (`14:00 - 14:30`)
    3. `Forecast (MW)` (User can edit inline!)
    4. `Bias Adj (MW)` (Dynamically calculated based on recent historical error)
    5. `Contracted MW` (Editable trading position)
    6. `P10 Floor` / `P90 Ceil`
    7. `Expected Cashout Exposure (£)` (Red if negative deficit, Green if safe)
    8. `Actions` (`[⟳ Re-price]`, `[Auto-Balance]`)
* **Grouped Ledger Sections:**
  * `▼ Peak Hours (SP 14 to SP 38 - Morning to Evening Peak)`
  * `▼ Off-Peak Overnight (SP 1 to SP 13)`
  * `▼ Off-Peak Late Night (SP 39 to SP 48)`
* Summary Footer with Grand Totals: Total MWh, Net Financial Risk, Weighted Mean Error.

---

### Route 3: `/terminal/accuracy` (Forecast Error & Stock Summary Matrix)
Inspired by **Screenshot 3 (Stock Summary - Item Wise)**:
* **Metric Cards at Top:**
  * `Overall WAPE`: `14.2%`
  * `Systematic Bias`: `+38.4 MW` (Over-forecasting warning in Red)
  * `Band Hit Rate (P10-P90)`: `82.5%`
  * `Total Imbalance Loss`: `£142,390`
* **Lead-Time Horizon Performance Table:**
  * Rows for lead horizons: `1 Hour Ahead`, `4 Hours Ahead`, `14 Hours Ahead (Day-Ahead Gate)`, `24 Hours Ahead`, `36 Hours Ahead`.
  * Columns: `Horizon`, `Samples (N)`, `MAE (MW)`, `RMSE (MW)`, `Bias (MW)`, `Worst Under-forecast (MW)`, `Status (OK / Degraded / Critical)`.
* **Lower Visuals:**
  * Godown-style horizontal bar chart: Error distribution by horizon.
  * Pie chart: Distribution of forecast errors (% of periods Over-forecasted vs Under-forecasted vs Within ±5%).

---

### Route 4: `/terminal/simulator` (Interactive Trading Sandbox & Hedging Strategy)
Inspired by **Screenshot 2 (Data Upload & Parameter Configuration)**:
* **Live What-If Simulation Form:**
  * `Market Price Scenario`: Dropdown (`Normal £65/MWh`, `Wind Drought £180/MWh`, `Negative Pricing -£25/MWh`)
  * `Wind Ramp Drop Event`: Checkbox with toggle for sudden wind curtailment.
  * `Volume Purchased Slider`: Drag to see real-time P&L changes.
* **Instant Calculation Outputs:**
  * Live-updating P&L gauge.
  * Dynamic list of simulated cashout transactions drawn on the fly.
  * Instant comparison table: *"Unhedged (Raw Forecast)"* vs *"Bias-Adjusted Hedge"* vs *"P10 Conservative Hedge"*.

---

## 5. Live Reactivity & Animation Details

To ensure the terminal **never feels like a static website**:
1. **Interactive Numeric Inputs & Spinners:**
   * Every number input has small `+` / `-` stepper buttons and a mini refresh button `[⟳]` next to it.
   * Modifying an input immediately fires recalculations with a brief **50ms yellow flash** on affected table cells (mimicking real-time trading terminals like Bloomberg/Tally updating live feeds).
2. **Mock Real-Time Ticking (Demo Polish):**
   * A simulated "Live Telemetry" ticker in the top bar: `[● LIVE GB GRID: 14,210 MW | Frequency: 49.98 Hz | Next Gate in: 04m 12s]`.
   * An optional "Jitter / Live Demo" switch that gently nudges the latest forecast values every 8 seconds, making the graphs and tables dynamically adjust before the viewer's eyes.
3. **Sound / Keypress Feedback (Optional Polish):**
   * Arrow keys (`↑`, `↓`) navigate table rows, moving the golden highlight bar seamlessly.
   * Pressing `Enter` opens an inspection drawer for that specific half-hour period.

---

## 6. Implementation Architecture & Code Structure

Claude should generate clean, production-ready React + TypeScript code:

```
frontend/src/
├── components/
│   ├── tally/
│   │   ├── TallyShell.tsx          # Master Navy header, breadcrumbs, status bar
│   │   ├── TallyActionRail.tsx     # Right-side F1-F12 hotkey bar with click handlers
│   │   ├── TallyTable.tsx          # High-density keyboard-navigable ledger table
│   │   ├── TallyTile.tsx           # Bordered dashboard tile with header and actions
│   │   ├── TallyInput.tsx          # Dense form input with live recalc trigger
│   │   └── TallyBadge.tsx          # Status badges (OK, Low, Warning, Dr/Cr)
│   └── charts/
│       ├── TallyLineChart.tsx      # High-contrast line & uncertainty band chart
│       └── TallyBarChart.tsx       # Tally sky-blue bar chart with baseline 0
├── views/
│   ├── TerminalBriefView.tsx       # Day-Ahead Brief (Screenshot 1 & 2 inspired)
│   ├── TerminalLedgerView.tsx      # Settlement Period Blotter (Screenshot 4 inspired)
│   ├── TerminalAccuracyView.tsx    # Horizon & Error Matrix (Screenshot 3 inspired)
│   └── TerminalSimulatorView.tsx   # Interactive Hedging Sandbox
├── context/
│   └── TerminalStateContext.tsx    # Reactive state: Gate, Date, Risk, Live Jitter, Calculations
└── styles/
    └── tally-terminal.css          # Full TallyPrime styling system (colors, borders, fonts)
```

---

## 7. Direct Instructions for Claude

When applying this prompt:
1. **Preserve All Backend Logic & API Integrations**: The backend FastAPI calculations (`analytics.py`, `elexon.py`, `store.py`) remain the bedrock. The frontend routes should call the real API, but include rich fallback/mock reactive state so that changing UI controls (sliders, dates, hedge volumes) triggers instant client-side calculations even if the backend is idle.
2. **Execute the Exact Visuals**: Do not default to generic Tailwind rounded cards. Use crisp, square borders (`border: 1px solid #b9d5ee`), 0px border-radius, dense tabular fonts, active yellow highlight rows (`#f8b819`), and the authentic Tally blue top header and right action rail.
3. **Ensure Large-Screen Readiness**: Expand the UI to comfortably fill standard desktop monitors (`1920x1080` and `1536x864`) with rich data density so it looks like an authentic workstation software.
