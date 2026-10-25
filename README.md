# GhostLedger

AI agents for invoice payments and customer support. A customer uploads an
invoice PDF or sends a message; Agent 3 reads it and routes the case; a bank
administrator approves any payment; a simulated bank moves the (fictional)
money; and Agent 5 explains the outcome to the customer in plain language.

Everything is synthetic: the Mock Bank, its ledger and every payment are fictional.

## Repository layout

```
ghostledger-agents/
├── backend/            Python API (FastAPI) - the agents, workflow and Mock Bank
│   ├── main.py         API entry point (run with uvicorn)
│   ├── agent3/         Agent 3: reads documents, validates, routes
│   ├── workflow/       Orchestrator, Agents 1, 2, 4, 5, Mock Bank, accounts, admin API
│   ├── tools/          seed_demo_accounts.py, fixture generators
│   ├── tests/          pytest suite (includes the diagram conformance tests)
│   ├── fixtures/pdfs/  Fictional test documents used by the demo scenarios
│   └── .env.example    Settings template - copy to .env and add your API key
└── frontend/           Web app (Vite + React + TypeScript + Tailwind)
    └── src/            Pages, API client, labels, tests
```

## Quick start (Windows PowerShell)

You need Git, Python 3.11+ and Node.js 20+.

**Window 1 - backend**
```powershell
git clone https://github.com/betsigma/ghostledger-agents.git
cd ghostledger-agents\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env        # then open .env and paste your key after LLM_API_KEY=
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

**Window 2 - frontend**
```powershell
cd ghostledger-agents\frontend
npm install
npm run dev
```

Open **<http://127.0.0.1:5173>**. (Port 8000 is the API; opening it redirects to the app.)

Next time, skip the one-off lines: activate the venv and start uvicorn in window 1,
and `npm run dev` in window 2.

### Demo logins

Created automatically on first start (`GHOSTLEDGER_DEMO_ACCOUNTS=1` in `.env`).
The sign-in page has a **Demo accounts** helper that fills them in.

| Email | Role | Password |
| --- | --- | --- |
| `customer.a@ghostledger.test` | Customer | `ghostledger-demo` |
| `customer.b@ghostledger.test` | Customer | `ghostledger-demo` |
| `bank.admin@ghostledger.test` | Bank admin | `ghostledger-demo` |
| `demo.admin@ghostledger.test` | Demo admin | `ghostledger-demo` |

Local demos only: never set `GHOSTLEDGER_DEMO_ACCOUNTS=1` on a public deployment
(it is refused when `GHOSTLEDGER_ENV=production`). The **Demo script** link on the
sign-in page walks through three demos.

### Common problems

| Problem | Fix |
| --- | --- |
| `Activate.ps1 cannot be loaded because running scripts is disabled` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then activate again |
| `python` is not recognised | Use `py` instead |
| "Email or password is incorrect" | Add `GHOSTLEDGER_DEMO_ACCOUNTS=1` to `backend\.env` and restart, or run `python -m tools.seed_demo_accounts` in `backend` |
| "Can't reach the GhostLedger server" | Window 1 (backend) is not running |

## The agents

| Agent | Role |
| --- | --- |
| **Agent 1** | Duplicate check: has this invoice been seen or paid already? Runs before any approval. |
| **Agent 2** | Bank reconciliation: is the payment really in the bank? |
| **Agent 3** | Intake: reads the PDF or message, validates the numbers, identifies the request, routes it. |
| **Agent 4** | Payment exceptions: why did a payment fail, and what next? Never retries. |
| **Agent 5** | Final answer: confirms the outcome and explains it to the customer. Moves no money. |
| Payment simulator | The only part that moves (fictional) money, after a bank admin approves. |

Agents never call each other directly; the orchestrator (`backend/workflow/orchestrator.py`)
coordinates every handoff.

## Where does the API key go?

**Not on GitHub.** The key goes in `backend/.env` on your own machine. That file
is gitignored, so it is never published; the repository ships
`backend/.env.example` as the template. Agent 3 works with any OpenAI-compatible
provider:

**xAI Grok** (the default in `.env.example`)
```dotenv
LLM_API_KEY=xai-...
LLM_BASE_URL=https://api.x.ai/v1
LLM_MODEL=grok-4.20-0309-non-reasoning
LLM_RESPONSE_FORMAT=json_object
```

**OpenAI**
```dotenv
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_RESPONSE_FORMAT=json_schema
```

**Local Ollama** (free, no key, slower)
```dotenv
LLM_API_KEY=ollama
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=qwen3:4b
LLM_TIMEOUT_SECONDS=900
```

Without a key the app still runs: live analysis is reported as unavailable
(never invented), and the scripted demo scenarios still work.

## Safety properties

- Only a bank administrator can approve a payment, never the customer who asked for it.
- Approval is bound to the exact invoice, payee, amount and currency.
- Idempotency keys are unique in the database, so the same invoice cannot be paid twice.
- Pending or failed payments are never retried automatically.
- A payment is only "confirmed" after Agent 2 verifies it against the bank.
- Customers see only their own cases and payments; every state change is in an audit trail.

## Tests

```powershell
cd backend
python -m pytest -q        # backend: about 525 tests, 2 live-AI tests skipped by default

cd ..\frontend
npm run typecheck
npm test                   # frontend: Vitest
```

## Documentation

- [`backend/README.md`](backend/README.md): workflow diagram, roles per route, every endpoint with examples.
- [`frontend/README.md`](frontend/README.md): running and testing the web app.

## License

MIT
