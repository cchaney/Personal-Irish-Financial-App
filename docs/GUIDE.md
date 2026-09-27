# PIFA (Personal Irish Financial App) — full guide

**Private, self-hosted personal finance for Ireland.** Track where your money goes, watch your net worth, investments, pensions and debts grow (or shrink), simulate your retirement with Irish tax rules built in, and get suggestions from a rules engine and an optional AI coach — all running on your own computer in Docker.

> ⚠️ PIFA is not financial advice. Read [DISCLAIMER.md](../DISCLAIMER.md).

## What it does

| Page | What you get |
|---|---|
| **Overview** | Net worth trend, monthly take-home vs spending, top suggestions |
| **Transactions** | Every account in one list, grouped by day. Search, filters, bulk edit, "needs review" for new imports, "always categorise this merchant like this" rules |
| **Cash flow** | Sankey diagram (income → spending groups → savings) and a profit & loss table |
| **Spending** | Donut and ranked bars by group, category or merchant, plus a monthly trend |
| **Net worth** | History chart, assets and liabilities by type |
| **Accounts** | Current, savings, investment, pension, property, credit cards, loans, mortgages |
| **Investments** | Holdings, gains, live prices by ticker, Irish exit tax and 8-year deemed disposal dates |
| **Pensions** | Every pot, contributions, and how much pension tax relief you're leaving unused |
| **Loans** | Payoff planner: highest-interest-first vs smallest-balance-first, with extra payments |
| **Simulator** | Monte Carlo pension projection (tax relief, lifestyling, lump sum, ARF drawdown, State Pension) and investment projection comparing ETF vs shares vs pension vs deposit after Irish tax |
| **AI coach** | Chat about your finances using a local model (Ollama) or Claude. Plus ~12 built-in checks that work without any AI |

**Built-in Irish rules (2026):** pension relief age bands (15–40%, €115k cap), 20/40% marginal rate, 25% lump sum (€200k tax-free), Standard Fund Threshold, State Pension (€299.30/week), My Future Fund auto-enrolment phases, 38% exit tax with deemed disposal, 33% CGT with €1,270 exemption, 33% DIRT. All in one file: `backend/app/services/irish_tax.py` — update it after each Budget.

### Where the data comes from (the honest version)

| Source | How |
|---|---|
| **Banks** (AIB, BOI, PTSB, Revolut, N26, bunq, credit unions…) | CSV export from your banking app/website → *Import CSV*. Column layout is auto-detected; duplicates are skipped so overlapping exports are safe. |
| **Pensions** (Irish Life, Zurich, Aviva, New Ireland, Standard Life, Royal London…) | None of the Irish providers offer a public data API. Enter each pot from your annual statement or online portal, including the fund's **risk rating (1–7)** from its factsheet — that drives the simulator's growth assumptions. You can also add the fund as a holding (units × unit price). |
| **ETFs and shares** | Add holdings with a Yahoo Finance ticker (e.g. `VWCE.DE`, `CSPX.AS`, `IWDA.AS`) and click *Update prices*. Converted to euro automatically. Off when `PIFA_OFFLINE=true`. |
| **Live bank sync** | Not yet — see Roadmap. GoCardless (ex-Nordigen) closed free signups; Enable Banking is the likely option. |

## Run it

### 1. Install Docker (one-off)
- **Windows / Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and open it once so it's running.
- **Linux:** install Docker Engine and the Compose plugin ([docs](https://docs.docker.com/engine/install/)).

Check it works in a terminal: `docker compose version`

### 2. Get the code
Either unzip the download, or:
```bash
git clone https://github.com/cchaney/Personal-Irish-Financial-App.git
cd Personal-Irish-Financial-App
```

### 3. Settings file (optional)
PIFA runs with sensible defaults, so you can skip this. To change the port, go fully offline or set up AI, copy the example and edit it:
```bash
cp .env.example .env          # Windows PowerShell: copy .env.example .env
```

### 4. Start it
```bash
docker compose up -d --build
```
The first build takes a few minutes. Then open **http://localhost:8080**.

### 5. Try it, then add your own data
1. **Settings → Load demo data** to explore with a fictional 34-year-old in Dublin.
2. When ready: **Settings → Delete all data**, then fill in **Settings → About you** (date of birth and gross salary matter for pensions and tax relief).
3. **Accounts → Add account** for each bank account, savings, investment account, pension and debt.
4. **Transactions → Import CSV** with an export from each bank.
5. Add holdings on **Investments**, and pension details on **Pensions**.
6. Every month or so, update balances and click **Net worth → Record today** to build your history.

### 6. Optional: turn on the AI coach

**Local and private (recommended)** — runs on your machine, nothing leaves it:
```bash
docker compose --profile ai up -d --build
docker compose exec ollama ollama pull llama3.1:8b     # ~5 GB download, one-off
```
Then **Settings → AI coach → Ollama → Save and test connection**. An 8B model needs about 8 GB of free RAM; answers take 10–60 seconds on a CPU, faster with a GPU (see the commented GPU section in `docker-compose.yml`). For a lighter model try `llama3.2:3b`; for better answers on a strong machine, `qwen2.5:14b`.

Already run Ollama or LM Studio on your computer? Use address `http://host.docker.internal:11434` (Ollama) or pick "Other local server" with `http://host.docker.internal:1234/v1` (LM Studio).

**Claude (cloud)** — best answers, but a summary of your finances is sent to Anthropic: put your key in `.env` as `ANTHROPIC_API_KEY=...`, run `docker compose up -d`, then choose Claude in **Settings → AI coach**. Click **See what the AI sees** on the coach page to inspect exactly what's shared.

### Everyday commands
```bash
docker compose stop                  # stop
docker compose start                 # start again
docker compose logs -f pifa          # see logs
git pull && docker compose up -d --build   # update to a new version
docker compose down                  # remove containers (your data volume is kept)
```

### Backups
Your data lives in the Docker volume `pifa-data` (one SQLite file). **Settings → Export backup** downloads everything as JSON; **Restore backup** loads it back. To copy the raw database file:
```bash
docker compose cp pifa:/data/pifa.db ./pifa-backup.db
```

### Fully offline
Set `PIFA_OFFLINE=true` in `.env` and run `docker compose up -d`. PIFA then never makes network requests (price updates and cloud AI are disabled). Fonts and charts are bundled, so the app works with no internet at all.

## Security
PIFA has no login. It's bound to `127.0.0.1` so only your computer can reach it. **Don't** expose it to the internet or change the port binding to `0.0.0.0` unless you put it behind a reverse proxy with authentication (or use Tailscale/WireGuard to reach it from your phone).

## Troubleshooting
| Problem | Fix |
|---|---|
| `port is already allocated` | Change `PIFA_PORT` in `.env` (e.g. 8090) and run `docker compose up -d` |
| Page won't load | `docker compose ps` should show `pifa` as healthy; check `docker compose logs pifa` |
| CSV import shows wrong amounts | In the import window, fix the column mapping, or tick "Flip signs" for credit-card exports that show purchases as positive |
| AI: "Can't reach the AI server" | Start with `--profile ai`, or check the address in Settings. On Linux, host-installed Ollama must listen on `0.0.0.0` (`OLLAMA_HOST=0.0.0.0`) |
| AI: model not downloaded | `docker compose exec ollama ollama pull <model>` |
| Prices won't update | Check the ticker on finance.yahoo.com; make sure `PIFA_OFFLINE` isn't `true` |

## Development
```bash
# API (http://localhost:8000, docs at /api/docs)
cd backend && pip install -r requirements.txt pytest
PIFA_DATA_DIR=./.data uvicorn app.main:app --reload
PIFA_DATA_DIR=/tmp/pifa-test pytest

# Frontend with hot reload (http://localhost:5173, proxies /api to :8000)
cd frontend && npm install && npm run dev
```

**Stack:** FastAPI + SQLModel + SQLite + NumPy · React 19 + Vite + Recharts · one Docker image, optional Ollama sidecar.

```
backend/app/
  services/irish_tax.py    ← all Irish rates and thresholds
  services/simulator.py    ← pension, investment (exit tax/deemed disposal) and debt engines
  services/insights.py     ← rule-based suggestions
  services/importers.py    ← bank CSV detection and parsing
  services/categorise.py   ← Irish merchant rules and merchant-name cleanup
  services/llm.py          ← Ollama / OpenAI-compatible / Anthropic
  routers/                 ← REST API
frontend/src/pages/        ← one file per page
```

## Roadmap
- Live bank sync via Enable Banking (free for your own accounts)
- Property pages (rental income and costs per property, feeding net cash flow into the main budget)
- Budgets and monthly targets per category
- Split transactions and tags
- Pension provider statement (PDF) import
- Scheduled monthly net-worth snapshots
- Dark mode

## Licence
[MIT](../LICENSE) — free to use, modify and share, with no warranty. See also [DISCLAIMER.md](../DISCLAIMER.md).
