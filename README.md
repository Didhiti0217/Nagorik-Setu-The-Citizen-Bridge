# নাগরিক সেতু · Nagorik Setu — "The Citizen Bridge"

**Gemma 4-powered civic issue triage for Gazipur City Corporation, Bangladesh.**

Built for *Build with Gemma: ML, AI, Deep Learning & NLP Community Hackathon* (Google for Developers · Kaggle).

> Nagorik Setu turns thousands of chaotic Bangla complaints into a short, ranked,
> de-duplicated, photo-verified work queue for a city corporation — powered
> end-to-end by a single open Gemma 4 model.

## 🔗 Live demo

- **App:** https://nagorik-setu.vercel.app
  - **Citizen** (report a problem, Bangla): https://nagorik-setu.vercel.app/report
  - **Councilor dashboard** (live map, ranked queue, copilot): https://nagorik-setu.vercel.app/admin
  - **Transparency** (every raw Gemma 4 call): https://nagorik-setu.vercel.app/transparency
- **API:** https://nagorik-setu-api-ciee.onrender.com/api/health

**No account, no signup form, no paywall — but reporting is tied to a phone number,
so there are two doors. Both are open to you right now:**

| Door | How to get in |
|---|---|
| **Resident** — [`/report`](https://nagorik-setu.vercel.app/report) | Enter **any** Bangladeshi-format mobile number (e.g. `01712345678`). The deployment runs in demo mode, so the 6-digit code is displayed on screen instead of being sent by SMS — no SIM needed. The number is never dialled or texted. |
| **Councilor console** — [`/admin`](https://nagorik-setu.vercel.app/admin) | `gcc@nagoriksetu.demo` · password `nagorik-demo-2026`. A published demo account, deliberately: a municipal work queue is not public data, and an empty login box would be a worse answer than a shared one. |
| **Transparency** — [`/transparency`](https://nagorik-setu.vercel.app/transparency) | Nothing. Left public on purpose so every raw Gemma 4 call, its latency and its output can be inspected without signing in at all. |

Why any sign-in at all: a resident has to be able to follow *their own* complaint, and one
citizen must not be able to read another's free text and precise location. The whole
authorization surface is in [`server/src/middleware/auth.js`](server/src/middleware/auth.js)
and is regression-tested by `npm run api:smoke` (70 checks, no cloud account needed).

Seeded with a synthetic corpus processed through the real pipeline
(see [Data & licensing](#data--licensing)).

---

## The problem

Civic complaint systems in Bangladesh do not fail at *collection*. They fail at **triage**.

A city corporation receives hundreds of complaints a day — in Bangla, in English, in
"Banglish", by phone, by Facebook comment. Forty citizens report the same sparking
transformer and it becomes forty tickets. Nobody can tell which complaints are real,
which are urgent, or which are the same physical problem described three different ways.

Nagorik Setu puts a reasoning model in that gap.

---

## What Gemma 4 does here

Gemma 4 is not a chatbot bolted onto a CRUD app. It performs **five distinct cognitive
roles**, and removing it leaves no product behind.

| # | Stage | What Gemma 4 does |
|---|---|---|
| 2 | **Triage** | Unstructured Bangla/Banglish/English complaint → strict validated JSON: category, severity 1-5, justification, bilingual summaries, department routing, PII flag |
| 3 | **Evidence verification** | Reads the citizen's photo *and* their claim, and judges whether the image actually supports the complaint |
| 4 | **Semantic deduplication** | Decides whether a new report describes the **same physical problem** as a nearby existing issue — across languages and scripts |
| 5 | **Dispatch brief** | Generates a municipal work order: crew, equipment, priority, SLA, plus a citizen-facing Bangla SMS |
| 6 | **Councilor's Copilot** | Natural-language Bangla questions → whitelisted tool calls → live map + Bangla narration |

**Gemma 4 is the only LLM in this repository.** Every inference call flows through a
single file — [`server/src/gemma/client.js`](server/src/gemma/client.js) — so this is
verifiable at a glance, not just claimed.

### Measured results

Evaluated on 30 labelled reports against `gemma-4-26b-a4b-it` via Google AI Studio.
Full numbers in [`server/eval/RESULTS.md`](server/eval/RESULTS.md); every individual error
is examined in [`server/eval/ERROR-ANALYSIS.md`](server/eval/ERROR-ANALYSIS.md).

| Metric | Result |
|---|---|
| Triage category accuracy | **29/30 (96.7%)** |
| Severity within ±1 | **30/30 (100%)** |
| Severity exact match | 21/30 (70%) |
| JSON schema-valid output | **30/30** — 0 repair passes, 0 manual-review fallbacks |
| Dedupe pairwise precision / recall | **90.9% / 100%** (F1 95.2%) |
| Copilot tool planning | **4/4** |

By input language — the Bangla-first claim, tested:

| Language | n | Category accuracy | Severity ±1 |
|---|---|---|---|
| Bangla | 10 | **100%** | 100% |
| Banglish (Latin script) | 6 | **100%** | 100% |
| English | 14 | 92.9% | 100% |

Safety behaviours:

| Check | Result |
|---|---|
| **Prompt-injection attempt** | ✅ **resisted** — ignored injected JSON, triaged the real content |
| PII detection (phone number + name) | ✅ flagged |
| Copilot on an empty result set | ✅ reported "no data" rather than inventing a count |
| Cross-lingual merge | ✅ 4 reports in Bangla + English + Banglish recognised as **one** transformer |

**We report the pessimistic figures.** The single category "miss" was an input reading only
`"help"`, which is not classifiable by anyone — the label was arbitrary. The single "false
merge" joined two reports about *the same drain on the same road*, which is arguably
correct and arguably a bad label. Both are dissected in the error analysis rather than
smoothed over.

Reproduce: `npm run eval`, `npm run gemma:smoke`, `node scripts/pipeline-demo.js`.

---

## Architecture

```
┌────────────────────┐        ┌─────────────────────┐
│  Citizen PWA       │        │ Councilor Dashboard │
│  React + Vite      │        │ React + Mapbox GL   │
│  photo · bn text   │        │ map · queue · copilot
└─────────┬──────────┘        └─────────┬───────────┘
          │  REST + SSE (live pin drop) │
          └───────────┬─────────────────┘
                      ▼
          ┌───────────────────────────┐
          │  Express API (Node 20+)   │
          │  routes → services        │
          └───────┬───────────┬───────┘
                  ▼           ▼
   ┌──────────────────┐   ┌────────────────────────┐
   │ MongoDB          │   │ gemma/client.js        │
   │ reports          │   │ ── THE ONLY AI CALL ── │
   │ issues (2dsphere)│   │ provider adapter       │
   │ gemma_calls      │   └──────────┬─────────────┘
   └──────────────────┘              ▼
                        ┌──────────────────────────┐
                        │ Google AI Studio (hosted)│
                        │   or Ollama (offline)    │
                        └──────────────────────────┘
```

### Why submission is asynchronous

Gemma 4 reasons before answering, and **thinking accounts for 75–80% of generated
tokens**. It cannot be disabled on these models (`thinkingConfig` returns HTTP 400), so
triage latency is an irreducible ~17s.

Rather than make a citizen watch a spinner, `POST /api/reports` persists the report and
returns **202 in ~100 ms**. The pipeline runs in the background and pushes the finished
issue to the dashboard over SSE. This is both better product design and a better demo —
the pin lands on the map on camera.

---

## Getting started

### Prerequisites

- **Node.js 20+**
- **MongoDB** — local or a free MongoDB Atlas cluster
- **A Gemma 4 provider**, either:
  - a [Google AI Studio](https://aistudio.google.com/) API key (hosted, fastest), or
  - [Ollama](https://ollama.com) ≥ 0.22 with `ollama pull gemma4:e4b` (fully offline)

### Install

```bash
git clone https://github.com/Didhiti0217/Gemma---AI---Hackathon-.git
cd Gemma---AI---Hackathon-/server
npm install
cp .env.example .env    # then fill in GOOGLE_API_KEY and MONGODB_URI
```

### Configure

`server/.env` — see [`server/.env.example`](server/.env.example) for the full list.

| Variable | Purpose |
|---|---|
| `GEMMA_PROVIDER` | `aistudio` · `ollama` · `mock` |
| `GEMMA_MODEL` | e.g. `gemma-4-26b-a4b-it` |
| `GOOGLE_API_KEY` | AI Studio key (only for `aistudio`) |
| `OLLAMA_HOST` / `OLLAMA_MODEL` | for the offline path |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | HS256 session signing key — **the server refuses to start** without at least 32 characters (`openssl rand -base64 48`) |
| `AUTH_DEMO_MODE` | `true` returns the login code in the API response so the demo needs no SMS gateway. Only valid with `OTP_SENDER=demo`; the pairing check is a boot interlock, not a warning |
| `ADMIN_SEED` | `<corporation>:<email>[:<password>]`, `;`-separated — consumed by `npm run seed:admins` |

> `.env` is gitignored. Never commit real keys.

### Create a console account

Admin accounts are never self-registered — they are seeded, or created by accepting an
invitation from an officer who already holds that jurisdiction. A fresh database has no
way into the console until you run:

```bash
npm run seed:admins        # reads ADMIN_SEED / ADMIN_SEED_PASSWORD
```

Idempotent: existing accounts keep their passwords unless you pass `--reset-password`.
Residents need no provisioning at all — the first correct one-time code creates the account.

### Run

```bash
npm run gemma:smoke
```

Verifies the Gemma engine end-to-end against 10 hostile inputs and all five stages, and
prints per-stage latency. No database required.

```bash
node scripts/pipeline-demo.js
```

Runs the full triage → evidence → dedupe → dispatch pipeline over a realistic burst of
nine Gazipur complaints using in-memory storage. No database required. This is the
clearest demonstration of the deduplication claim.

```bash
npm run api:smoke
```

Boots an in-memory MongoDB and the real Express app with Gemma set to fixtures, then
asserts 70 behaviours: the geospatial dedupe, the async 202 pipeline, SSE, the audit log,
the copilot tool boundary, and every authorization rule — the whole OTP round trip, the
attempt cap, invite jurisdiction inheritance, and each role boundary. No key, no cloud
account, no network.

---

## Project status

This is an active hackathon build. Current state:

- ✅ **Gemma 4 engine** — all five stages, provider adapter, validation + repair, audit logging
- ✅ **Report pipeline** — async, with dependency-injected storage
- 🚧 **Persistence layer** — Mongoose models and geospatial queries
- 🚧 **REST API + SSE**
- 🚧 **Citizen PWA and councilor dashboard**

## Repository layout

```
server/
├── src/gemma/
│   ├── client.js          ← the ONLY file that calls a model
│   ├── schemas.js         ← zod contracts for every stage
│   ├── index.js           ← the five stage functions (public surface)
│   └── prompts/           ← one versioned file per stage
├── src/services/
│   └── pipeline.js        ← intake → triage → evidence → dedupe → issue
└── scripts/
    ├── gemma-smoke.js     ← hostile-input smoke test
    └── pipeline-demo.js   ← end-to-end dedupe demo, no DB needed
```

## Project documentation

The full engineering record is in [`docs/`](docs/):

| Document | What it covers |
|---|---|
| [`docs/plan.md`](docs/plan.md) | Product design, the five-stage Gemma engine, architecture, execution plan, risk register |
| [`CLAUDE.md`](CLAUDE.md) | Operating rules for the repo — competition constraints, architecture rules, code conventions |
| [`docs/progress_participant_1.md`](docs/progress_participant_1.md) | Build log: measured results, critical findings, decisions log |
| [`docs/Competition-Link.txt`](docs/Competition-Link.txt) | The competition this was built for |

**Three findings in there worth reading even if you never run this code:**

1. **Gemma 4 returns its reasoning as ordinary `parts[]` entries flagged `thought: true`,
   before the answer.** Joining all parts gives you the reasoning trace instead of the
   JSON — correct output that looks like a parse failure.
2. **Thinking cannot be disabled** on 26B/31B (`thinkingConfig` → HTTP 400) and consumes
   75–80% of output tokens. Too small a `maxOutputTokens` and the model reasons itself
   out of budget and returns nothing.
3. **Few-shot examples make it *faster*** — 597 thought tokens vs 945 without. Examples
   give the model a template so it reasons less.

## Dependencies

`express` · `mongoose` · `zod` · `multer` · `cors` · `dotenv` — see
[`server/package.json`](server/package.json). No AI SDK: the Gemma provider adapter uses
`fetch` directly, which keeps the inference surface small and auditable.

## Data & licensing

No external dataset is used. All demonstration reports are synthetic, written for this
project to reflect realistic Gazipur civic complaints, and processed through the **real**
Gemma 4 pipeline — no responses are hardcoded or mocked in any demo.

Code is released under the MIT License.

## Model attribution

Uses **Gemma 4** by Google DeepMind, under the
[Gemma Terms of Use](https://ai.google.dev/gemma/terms). Gemma 4 is the only large
language model used in this project.
