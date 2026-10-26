# Wind Desk — Realistic Staggered Calculation & Empty States Specification
> **Prompt for Claude:** Transform Wind Desk from instantaneous static rendering into an authentic, heavy-computation financial/trading workstation with progressive loading, calculation telemetry, and initial empty-state layouts.

---

## 1. Problem Statement & Desired Behavior

### The Problem:
Currently, the UI appears too instant and pre-baked. It does not feel like an enterprise terminal performing intensive physical wind backtests, quantile distributions, or settlement cashout math.

### The Solution:
1. **Initial Uncalculated / Empty State:**
   * Before parameters (Delivery Date, Gate Closure, Risk Tolerance) are confirmed, all views render **empty layout wireframes / clean grid axes** without mock data.
   * Metric cards show `--- MWh` or `Awaiting Input`.
   * Tables display empty numbered voucher rows with subtle dashes.
   * Charts render the gridlines, axes, and timestamps, but with no lines plotted—only an *"Awaiting calculation execution (Press [F4: Compute] or Enter)"* prompt.
2. **Staggered Progressive Calculation Flow (The "Heavy Math" Feel):**
   * When the user picks a date or presses **`[⚡ Execute Calculation]`** / **`[F4: Compute]`** / **`[⟳ Recalc]`**, the terminal triggers a realistic **staggered calculation pipeline** (total duration ~1.2s – 1.8s).
   * Components don't appear all at once; they compute and unlock sequentially with authentic terminal status tickers, odometer number count-ups, and animated chart drawing.

---

## 2. Calculation Pipeline & Stagger Sequence

When the user triggers a calculation, execute the following state machine:

```
[IDLE / EMPTY] 
      │  User selects Date/Gate & clicks [⚡ Execute Calculation] or [F4]
      ▼
[PHASE 1: 0ms – 250ms]  ──► Top Status Bar: "Connecting to BMRS / Fetching 408 runs..."
      │                      Inputs freeze briefly with subtle pulse; calculation spinner active.
      ▼
[PHASE 2: 250ms – 550ms] ──► KPI Metrics unlock sequentially (left to right):
      │                      - P50 Expected MWh counts up with odometer animation.
      │                      - P10 Floor & P90 Ceiling calculate and lock in.
      │                      - Hedge recommendation flashes amber.
      ▼
[PHASE 3: 550ms – 950ms] ──► Charts draw dynamically:
      │                      - SVG Path stroke-dasharray animates the forecast curve left-to-right.
      │                      - The P10/P90 uncertainty cloud expands smoothly outward.
      │                      - Crosshair cursor unlocks.
      ▼
[PHASE 4: 950ms – 1350ms] ──► Settlement Ledger table rows populate:
      │                      - Rows cascade down (staggered 15ms per row or batch of 6 SPs).
      │                      - Cashout risk figures flash in Red/Green.
      ▼
[SETTLED / READY]       ──► Status: "Calculated in 1.18s | 19,533 points verified | No Lookahead OK"
```

---

## 3. UI Implementation Details

### 3.1 Initial Empty States (Before Computation)
Create dedicated empty states for every component:

#### A. Metric Cards (Figures.tsx / Num.tsx)
* Displays `---` with small subtext: `[Awaiting Gate Time]`
* A subtle pulsating yellow border on the input selector indicating the user needs to confirm parameters.

#### B. Charts (TallyLineChart.tsx & TallyBarChart.tsx)
* Render the X-axis (Settlement Periods 1 to 48: `00:00` to `24:00 GMT`) and Y-axis (`0 MW` to `16,000 MW`), including horizontal grid rules.
* Do not plot any line or fill.
* Centered watermark inside the chart canvas:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │ 16,000 MW ┼  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . │
  │ 12,000 MW ┼  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . │
  │           │      [ ⚡ RUN CALCULATION TO RENDER CURVES ]     │
  │  8,000 MW ┼      Settlement: 2026-01-16 | Gate: 09:50       │
  │  4,000 MW ┼  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . │
  │      0 MW └─────────────────────────────────────────────────┤
  │          00:00   04:00   08:00   12:00   16:00   20:00  24:00│
  └─────────────────────────────────────────────────────────────┘
  ```

#### C. Ledger Table (TallyTable.tsx / TerminalLedgerView.tsx)
* Renders the table structure and header columns (`SP`, `TIME`, `FORECAST MW`, `BIAS ADJ`, `IMBALANCE EXPOSURE`).
* Renders 12 placeholder skeleton rows with dashed cells: `SP 01 | 00:00 - 00:30 | --- | --- | --- | Awaiting Calc`.
* Table footer shows: `Rows: 0/48 Computed | Net Exposure: £ 0.00`.

---

### 3.2 Live Computation Feedback & Micro-Animations

#### A. The Global Calculation Status Strip
In `TallyShell.tsx`, add a computation progress ticker:
* When calculating:
  `[ ⟳ COMPUTING: Step 2/4 - Evaluating 14-day Rolling Bias at 14h Lead Time... (42%) ]`
* When finished:
  `[ ● READY | Computed 48 SPs in 1,240ms | Memory: 14.2 MB | Model: No-Lookahead v4.2 ]`

#### B. Component-Level Recalculate Buttons
Add small inline action triggers:
* In the control bar: **`[ ⚡ Recompute Model ]`**
* Next to the Date / Gate inputs: **`[ ⟳ Update ]`**
* Next to Risk Tolerance slider: **`[ ⌥ Re-Hedge ]`**
* Clicking any of these triggers the 400ms – 800ms calculation state, showing a mini spinner and flashing the modified figures with a temporary **50ms yellow calculation pulse** (`background-color: #fff6be; transition: background 0.3s;`).

#### C. Chart Dynamic Drawing Effect
In `TallyLineChart.tsx`:
* Use CSS or SVG animation for lines:
  ```css
  .tally-line-animated {
    stroke-dasharray: 2000;
    stroke-dashoffset: 2000;
    animation: drawLine 0.75s ease-out forwards;
  }
  @keyframes drawLine {
    to {
      stroke-dashoffset: 0;
    }
  }
  ```
* The P10/P90 cloud fades in with `opacity: 0 -> 0.15` as the line finishes drawing.

#### D. Odometer Metric Animation
In `Num.tsx`:
* Instead of instantly snapping from `0` to `184,210 MWh`, use a lightweight count-up hook (`useCountUp` over 400ms) with tabular figures so the numbers roll like an authentic trading terminal counter.

---

## 4. State Management Architecture

Implement a clean calculation state machine in `TerminalStateContext.tsx`:

```typescript
export type CalcStatus = 'empty' | 'initializing' | 'computing_metrics' | 'drawing_charts' | 'populating_table' | 'ready';

interface TerminalState {
  calcStatus: CalcStatus;
  calcProgress: number; // 0 to 100
  calcDurationMs: number;
  hasRunInitialCalc: boolean;
  
  // Parameters
  deliveryDate: string | null; // null initially => triggers empty state
  gateTime: string;            // '09:50'
  riskTolerance: number;       // 0 to 1
  cashoutRate: number;         // 85.0
  
  // Actions
  triggerCalculation: (customDelayMs?: number) => void;
  resetToEmpty: () => void;
  setDeliveryDate: (date: string) => void;
  setGateTime: (gate: string) => void;
  setRiskTolerance: (val: number) => void;
}
```

### Stagger Timing Implementation:
```typescript
const triggerCalculation = (duration = 1200) => {
  setCalcStatus('initializing');
  setCalcProgress(10);
  
  setTimeout(() => {
    setCalcStatus('computing_metrics');
    setCalcProgress(40);
  }, duration * 0.25);

  setTimeout(() => {
    setCalcStatus('drawing_charts');
    setCalcProgress(70);
  }, duration * 0.55);

  setTimeout(() => {
    setCalcStatus('populating_table');
    setCalcProgress(90);
  }, duration * 0.85);

  setTimeout(() => {
    setCalcStatus('ready');
    setCalcProgress(100);
  }, duration);
};
```

---

## 5. Screen-by-Screen Behavior Requirements

1. **On First Page Load:**
   * Do NOT immediately load the completed charts and numbers.
   * Display the empty grid layouts, empty voucher rows, and an active banner:  
     `"Terminal Initialized. Select Delivery Day (e.g. 2026-01-16) and click [⚡ Execute Calculation (F4)]"`.
2. **On Parameter Change (Date/Gate/Risk Slider):**
   * If the user moves the Risk Tolerance slider:
     * Only re-compute downstream figures (takes ~300ms, showing `[⟳ Re-hedging...]`).
     * The recommended hedge number and cashout risk recalculate and flash yellow.
   * If the user selects a new Delivery Date:
     * Triggers the full 1.2s calculation pipeline with chart re-drawing and table cascade.
3. **F4 Keyboard Shortcut:**
   * Pressing `F4` on the keyboard anywhere in the app triggers the calculation run with sound/visual click feedback.

---

## 6. Deliverables Required from Claude

1. **Update `TerminalStateContext.tsx`**: Add `calcStatus`, `calcProgress`, `triggerCalculation`, and support `deliveryDate = null` for initial empty states.
2. **Update `TallyShell.tsx`**: Add calculation progress bar, step messages, and `F4: Compute` hotkey binding.
3. **Update `TallyLineChart.tsx` & `TallyBarChart.tsx`**: Add empty grid state + SVG path draw-in animation when entering `'drawing_charts'` status.
4. **Update `TallyTable.tsx`**: Add skeleton/placeholder dashed rows when `'empty'`, and cascading row animation when `'populating_table'`.
5. **Update `TerminalBriefView.tsx` & `TerminalLedgerView.tsx`**: Integrate empty states and hook up the `[⚡ Execute Calculation]` and `[⟳ Recalc]` buttons.
