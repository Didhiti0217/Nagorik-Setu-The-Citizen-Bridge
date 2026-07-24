# নাগরিক সেতু · Nagorik Setu — "The Citizen Bridge"

**Gemma 4-powered civic issue triage for Gazipur City Corporation, Bangladesh.**

Built for *Build with Gemma: ML, AI, Deep Learning & NLP Community Hackathon* (Google for Developers · Kaggle).

> Nagorik Setu turns thousands of chaotic Bangla complaints into a short, ranked,
> de-duplicated, photo-verified work queue for a city corporation — powered
> end-to-end by a single open Gemma 4 model.

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

Run against `gemma-4-26b-a4b-it` via Google AI Studio:

| Test | Result |
|---|---|
| Triage on 10 deliberately hostile inputs | **10/10 clean** — 0 repairs, 0 manual-review, 0 exceptions |
| Pure Bangla / Banglish / phonetic-Latin script | ✅ all handled correctly |
| PII detection (phone number + name) | ✅ flagged |
| **Prompt-injection attempt** | ✅ **defeated** — ignored the injected JSON, triaged the real content correctly |
| Duplicate clustering on a 9-report burst | **9 reports → 5 issues (44% collapse)** |
| Cross-lingual merge | ✅ 4 reports in Bangla + English + Banglish recognised as **one** transformer |
| Dedupe negative control | ✅ refused to merge a water outage with an electrical hazard 30 m away |

Reproduce both with `npm run gemma:smoke` and `node scripts/pipeline-demo.js`.

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

> `.env` is gitignored. Never commit real keys.

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
| [`docs/CLAUDE.md`](docs/CLAUDE.md) | Operating rules for the repo — competition constraints, architecture rules, code conventions |
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
