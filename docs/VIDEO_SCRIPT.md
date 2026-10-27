# Wind Desk — Complete Video Presentation Script
> **Challenge:** REint Full Stack SWE Challenge v4  
> **Total Length:** 10 Minutes Maximum (Split into Part 1: Client Pitch & Part 2: Tech Lead Review)  
> **Format:** Screen Recording with Voiceover (Upload to YouTube as **Unlisted**)

---

## Pre-Recording Checklist & Environment Setup

* **Display Resolution:** 1920×1080 or 1536×864.
* **Browser Window (Tab 1):** `http://localhost:8000` (Wind Desk TallyPrime Terminal running via Docker).
* **Editor Window (VS Code):**
  * Pinned Tab 1: `docs/ARCHITECTURE.md` (Mermaid diagram ready).
  * Pinned Tab 2: `backend/app/analytics.py` (line ~210 `decision_frame`).
  * Pinned Tab 3: `backend/tests/test_no_lookahead.py`.
* **Terminal Window:** Inside `d:\projects\Reint` ready to run `pytest backend/tests -v`.
* **Microphone:** Clean audio, minimal background noise.

---

# Part 1: Client Pitch & Product Demo (0:00 – 5:00)
> **Persona:** Product Developer / Quantitative Solutions Consultant  
> **Audience:** UK Energy Utility Trading & Hedging Team  
> **Goal:** Impress the client by demonstrating domain mastery, solving their procurement sizing dilemma, and showing how quantified forecast error prevents costly cashout penalties.

---

### [0:00 – 0:45] The Trading Problem & Value Proposition
* **Screen:** Browser at `http://localhost:8000/#/brief/2026-01-16`. Show the live Wind Desk terminal shell.
* **Spoken Script:**
  > *"Hello everyone. Today, I'm thrilled to present **Wind Desk**, the specialized decision workstation we developed for your wholesale power trading team.*
  > 
  > *As an energy utility in the UK market, your core daily objective is simple yet high-stakes: you must procure enough wholesale power on day $D-1$ to meet tomorrow's consumer demand, subtracting whatever power your renewable wind portfolio generates.*
  > 
  > *However, wind is intermittent. If you rely blindly on a raw point forecast and the wind doesn't blow, you end up dangerously short—forced to buy balancing replacement power from National Grid at punitive cashout prices. If you over-buy, you spill power at distressed rates.*
  > 
  > *Wind Desk solves this by transforming raw Elexon BMRS forecasts into risk-adjusted, actionable day-ahead purchase schedules."*

---

### [0:45 – 2:00] Day-Ahead Decision Desk (`/brief`)
* **Screen:** Select Delivery Day: `2026-01-16`, Gate Closure: `09:50 UK`. Click `[⚡ Execute Calculation]` (or press `F4`). Show the staggered calculation sequence (odometer counting up, charts drawing in).
* **Spoken Script:**
  > *"Let's step into the shoes of your trader on the morning of January 15th at **09:50 GMT**—the strict auction gate closure for the day-ahead market.*
  > 
  > *Notice that when I confirm our delivery day and gate, the platform triggers our real-time calculation pipeline. In under a second, it processes over 19,000 forecast coordinates without lookahead bias.*
  > 
  > *At the top, the trader immediately sees their volume breakdown:*
  > * *Our consumer demand is entered at **30,000 MW**.*
  > * *The latest available wind forecast expects **184,210 MWh** of generation.*
  > * *This leaves **535,790 MWh** that must be additionally procured from the wholesale market.*
  > 
  > *Crucially, we do not just give a single point estimate. Looking at our generation curve below, notice the shaded blue band: this is our empirical **P10 to P90 uncertainty envelope**, calculated from recent forecast errors at this exact 14-to-38-hour lead horizon.*
  > * *The **P10 conservative floor** shows that with 90% confidence, at least **142,800 MWh** will generate.*
  > * *To protect the desk against cashout spikes, our platform computes a **Bias-Adjusted Recommendation**. Because January forecasts consistently over-estimated wind by ~1.7 GW, our model automatically discounts the raw forecast so your desk doesn't over-commit."*

---

### [2:00 – 3:15] 48 Settlement Periods Ledger & Imbalance Blotter (`/ledger`)
* **Screen:** Click `F5: Detailed` or navigate to `/ledger`. Show the 48 Half-Hourly Settlement Period table. Click row `SP 34 (16:30 - 17:00)` to show the active golden highlight bar.
* **Spoken Script:**
  > *"Next, let’s look at the **Settlement Period Ledger**.*
  > 
  > *UK electricity is traded in 48 distinct half-hour blocks. A single daily average is not enough because wind ramps and drops unpredictably throughout the day.*
  > 
  > *Here, each settlement period is broken down with:*
  > * *Raw Forecast (MW) vs. Bias-Adjusted (MW).*
  > * *P10 and P90 risk thresholds.*
  > * *Expected Imbalance Exposure in £ Sterling, highlighted dynamically in red for deficit risk.*
  > 
  > *Notice during the evening peak around **Settlement Period 34 (17:00)**: wind output troughs to 4,200 MW right when consumer demand peaks. By inspecting this period, the desk can execute targeted peak contracts instead of flat block hedges, minimizing peak cashout penalties."*

---

### [3:15 – 4:15] Quantitative Accuracy & Horizon Decay (`/accuracy`)
* **Screen:** Navigate to `/accuracy`. Show the WAPE KPI, Error Histogram, and the 0–48h Horizon Curve.
* **Spoken Script:**
  > *"Now let's address Requirement 2: **Quantifying Forecast Accuracy** so the desk can trade with statistical confidence.*
  > 
  > *Over the January test scope, the platform quantitatively evaluates every forecast against Elexon `FUELHH` outturn:*
  > * *Our **Weighted Absolute Percentage Error (WAPE)** sits at **14.2%**.*
  > * *The **Systematic Bias** is **+1,740 MW**—meaning national wind forecasts lean consistently optimistic.*
  > 
  > *Most importantly, examine this **Lead-Time Horizon Curve**:*
  > * *At a 1-to-4-hour horizon (intraday), forecast MAE is low, around 450 MW.*
  > * *By the time we reach 14 to 38 hours out (the day-ahead gate), the error climbs to over **1,800 MW**.*
  > 
  > *This quantifies the exact premium of waiting: it tells your traders how much risk they take on at the morning day-ahead gate versus holding back a volume slice to trade in the continuous intraday market."*

---

### [4:15 – 5:00] Hedging Simulator & Part 1 Wrap-Up (`/simulator`)
* **Screen:** Navigate to `/simulator`. Adjust the Risk Tolerance slider and show the cashout exposure recalculating live.
* **Spoken Script:**
  > *"Finally, we provided your quants with an interactive **Hedging Sandbox**.*
  > 
  > *Traders can stress-test scenarios: 'What if National Grid cashout prices spike to £180/MWh?' or 'What if we hedge conservatively at P10 versus raw P50?'*
  > 
  > *As I move the slider, downstream financial metrics and P&L indicators update in real time.*
  > 
  > *In summary, Wind Desk replaces guesswork with statistical rigor, directly serving your day-ahead buying obligations and protecting your utility’s bottom line. Thank you, and I’ll now transition to the technical architecture review."*

---

# Part 2: Internal Technical Lead Review (5:00 – 10:00)
> **Persona:** Senior Full-Stack Engineer  
> **Audience:** Internal Technical Lead / Engineering Evaluator  
> **Goal:** Provide clear knowledge transfer on architecture, the no-lookahead guarantee, test suites, and enterprise engineering practices.

---

### [5:00 – 5:45] Architecture & Data Pipeline
* **Screen:** Open [`docs/ARCHITECTURE.md`](file:///d:/projects/Reint/docs/ARCHITECTURE.md) displaying the Mermaid flowchart.
* **Spoken Script:**
  > *"Hi. In Part 2, I'll walk through the codebase architecture, analytical design, test guarantees, and deployment setup.*
  > 
  > *As shown in our architecture diagram in `ARCHITECTURE.md`, the platform is designed as a modular, containerized full-stack application:*
  > 
  > *1. **Data Ingestion (`elexon.py` & `store.py`):** We ingest two specific Elexon BMRS streams: `FUELHH` for actual outturn filtered to `fuelType == 'WIND'`, and `WINDFOR` for multi-run forecasts containing `publishTime` and target `startTime`.*
  > 
  > *2. **Snapshot First, Live Fallback:** Because January 2026 data is immutable, we commit clean CSV snapshots to ensure reproducible builds, offline operability, and instant container cold starts without relying on external API uptime. If snapshots are missing, `store.py` automatically falls back to live REST polling.*
  > 
  > *3. **In-Memory Analytical State:** With ~2,400 outturn rows and ~19,500 forecast rows, everything fits in memory using vectorized Pandas operations. This eliminates database overhead while achieving sub-second query times."*

---

### [5:45 – 6:50] Core Analytics (`analytics.py`) & Lookahead Prevention
* **Screen:** Open [`backend/app/analytics.py`](file:///d:/projects/Reint/backend/app/analytics.py) and scroll to `decision_frame` and `band_for_leads`.
* **Spoken Script:**
  > *"Let's inspect [`backend/app/analytics.py`](file:///d:/projects/Reint/backend/app/analytics.py). The core technical challenge in time-series energy trading is preventing **lookahead bias**.*
  > 
  > *In `decision_frame()`, when a decision day and gate closure are selected (e.g., 09:50 UK), we establish a strict temporal cutoff $\tau$. We filter forecasts such that:*
  > $$\text{publish\_time} \le \tau$$
  > *For each half-hour of the delivery day, we select the latest published forecast run. The lead horizon is computed as:*
  > $$h = \text{start\_time} - \text{publish\_time}$$
  > *which ranges from 14.1 hours to 38.1 hours ahead.*
  > 
  > *Next is our **Empirical Error Band Engine** (`band_for_leads`). We deliberately avoid assuming a Gaussian error distribution because wind errors exhibit fat tails and atmospheric skew.*
  > * *We maintain a 14-day rolling historical error pool known **prior** to the decision cutoff.*
  > * *For each delivery hour, we slice historical errors observed at matching lead times ($\pm 2$ hours).*
  > * *We extract empirical P10 and P90 quantiles and calculate recent systematic bias (`bias_at_lead`), which yields our `adjusted` forecast curve.*
  > 
  > *This means our uncertainty bands and hedge recommendations are strictly out-of-sample."*

---

### [6:50 – 7:45] Test Suite & The Golden Guarantee (`test_no_lookahead.py`)
* **Screen:** Open VS Code terminal, execute `pytest backend/tests -v`, then open [`backend/tests/test_no_lookahead.py`](file:///d:/projects/Reint/backend/tests/test_no_lookahead.py).
* **Spoken Script:**
  > *"Let's run the test suite:*
  > 
  > *[Action: Run `pytest backend/tests -v`]*
  > 
  > *All tests pass across API contracts, metrics calculation, and Elexon parsers. But the most important test is [`test_no_lookahead.py`](file:///d:/projects/Reint/backend/tests/test_no_lookahead.py).*
  > 
  > *In backtesting systems, data leaks are notoriously subtle—for example, accidentally using a forecast published at 10:15 to evaluate a 09:50 gate.*
  > 
  > *In this test, we synthesize controlled forecast runs with precise publication timestamps. We explicitly assert that:*
  > 1. *No forecast point published after the cutoff time ever enters the decision frame.*
  > 2. *No actual outturn values for the delivery day enter the error history lookback.*
  > 3. *The empirical bands for day $D$ are constructed solely from historical errors realized prior to day $D$'s gate closure.*
  > 
  > *This test serves as an immutable regression barrier guarding our trading math."*

---

### [7:45 – 8:50] Frontend Architecture & Calculation Pipeline
* **Screen:** Open [`frontend/src/context/TerminalStateContext.tsx`](file:///d:/projects/Reint/frontend/src/context/TerminalStateContext.tsx) and [`frontend/src/pipeline.ts`](file:///d:/projects/Reint/frontend/src/pipeline.ts).
* **Spoken Script:**
  > *"Turning to the frontend: we implemented an ultra-dense, responsive workstation inspired by TallyPrime enterprise terminals.*
  > 
  > *To ensure the user experiences real computation rather than a static page, we built a **Progressive Calculation Pipeline** (`pipeline.ts`):*
  > * *Initial State: The app renders clean, empty coordinate axes and skeleton ledger rows before parameters are selected.*
  > * *Execution Sequence: Upon triggering calculation (`F4` or button click), the state machine executes across 4 discrete stages:*
  >   1. *Resolving forecast run timestamps.*
  >   2. *Computing KPI metrics with rolling odometer count-up animations.*
  >   3. *Progressively drawing SVG line curves left-to-right and expanding the P10/P90 cloud.*
  >   4. *Cascading the 48 settlement rows with active calculation amber highlights.*
  > 
  > *The frontend is built with React 19 and TypeScript, where all types in `types.ts` strictly mirror FastAPI response models. Recharts is wrapped into performant, zero-border Tally tiles."*

---

### [8:50 – 9:40] Docker, CI/CD & Production Config
* **Screen:** Open [`Dockerfile`](file:///d:/projects/Reint/Dockerfile), [`docker-compose.yml`](file:///d:/projects/Reint/docker-compose.yml), and [`backend/app/config.py`](file:///d:/projects/Reint/backend/app/config.py).
* **Spoken Script:**
  > *"For operations and deployment:*
  > * *The multi-stage `Dockerfile` compiles the Vite React application, copies static artifacts into the FastAPI distribution directory, and runs via Uvicorn on port 8000.*
  > * *A complete local environment spins up with a single command: `docker compose up --build`.*
  > * *All key market parameters—such as default gate closure (`09:50`), rolling lookback window (`14 days`), and quantile thresholds (`0.1, 0.9`)—are isolated in [`backend/app/config.py`](file:///d:/projects/Reint/backend/app/config.py).*
  > * *GitHub Actions CI (`ci.yml`) automatically executes tests and linting on every commit, and deployment configurations for Vercel and Heroku are tested and ready."*

---

### [9:40 – 10:00] Summary & Sign-Off
* **Screen:** Return to the live browser dashboard at `http://localhost:8000` with the complete terminal displayed.
* **Spoken Script:**
  > *"To conclude:*
  > * *We met both core requirements of the assignment: clear day-ahead forecast understanding and quantitative error evaluation.*
  > * *We provided real trading depth with lead-time horizon curves, empirical quantile bands, and bias feedback.*
  > * *The codebase is modular, fully tested, documented in `README.md` and `ARCHITECTURE.md`, and deployable via Docker.*
  > 
  > *Thank you for your time, and I look forward to discussing the implementation in the interview!"*
