# নাগরিক সেতু · Nagorik Setu — "The Citizen Bridge"

**Civic issue triage for Bangladeshi city corporations, powered end to end by a single open Gemma 4 model.**

Built for *Build with Gemma: ML, AI, Deep Learning & NLP Community Hackathon* (Google for Developers · Kaggle).

> Nagorik Setu turns thousands of chaotic Bangla complaints into a short, ranked,
> de-duplicated, photo-verified work queue for a city corporation.

---

## 🔗 Live demo

| | |
|---|---|
| **App** | https://nagorik-setu.vercel.app |
| **API health** | https://nagorik-setu-api-ciee.onrender.com/api/health |

**No account of your own, no signup form, no paywall.** Reporting is tied to a phone
number and a municipal work queue is not public data, so there are two doors — and both
are published here, open right now:

| Door | How to get in |
|---|---|
| 🧍 **Resident** — [`/report`](https://nagorik-setu.vercel.app/report) | Enter **any** Bangladeshi-format mobile number (e.g. `01712345678`). The deployment runs in demo mode, so the 6-digit code appears **on screen** instead of being sent by SMS — no SIM required. The number is never dialled or texted. |
| 🏛️ **Councilor console** — [`/admin`](https://nagorik-setu.vercel.app/admin) | `gcc@nagoriksetu.demo` · password `nagorik-demo-2026` — a deliberately published demo account. |
| 🔍 **Transparency** — [`/transparency`](https://nagorik-setu.vercel.app/transparency) | Nothing at all. Left fully public on purpose, so every raw Gemma 4 call, its latency and its output can be inspected without signing in. |

**Why a sign-in exists.** A resident must be able to follow *their own* complaint, and one
citizen must not be able to read another's free text and precise location. The rule that
matters — that a judge needs no account of their own — is satisfied by *publishing* the
way in, not by leaving a work queue open to the internet. The entire authorization surface
is one file, [`server/src/middleware/auth.js`](server/src/middleware/auth.js), and is
regression-tested by `npm run api:smoke` (no cloud account needed).

---

## The problem

Civic complaint systems in Bangladesh do not fail at *collection*. They fail at **triage**.

A city corporation receives hundreds of complaints a day — in Bangla, in English, in
"Banglish", by phone, by Facebook comment. Forty citizens report the same sparking
transformer and it becomes forty tickets. Nobody can tell which complaints are real, which
are urgent, or which are the same physical problem described three different ways.

Three specific failures:

1. **Duplication.** One transformer, forty tickets, no way to see it is one problem.
2. **No prioritization.** A missing manhole cover and a broken streetlight land in the
   same undifferentiated pile.
3. **Unverifiable claims.** No cheap way to separate a real report from a mistaken one
   without sending a person to look.

The people worst served are those least able to navigate a bureaucratic form. Nagorik Setu
puts a reasoning model in that gap.

---

## What it does

**For the resident** — a one-screen mobile web app, Bangla by default. Describe the problem
in any language, snap a photo, submit. **No category dropdown, no severity slider, no
department picker** — a resident should not have to understand how a municipality is
organized to report a broken thing. Gemma infers all of it. Afterwards they see *what the
system understood*, which is a trust feature as much as a confirmation.

**For the councilor** — a jurisdiction-scoped console showing **issues, not reports**: the
deduplicated physical problems, ranked by a priority weight blending severity, report count
and threat to life. The work queue sits beside a permanent map. Each issue opens a
Gemma-generated dispatch brief — crew, equipment, SLA, bilingual work order — and the
reason each duplicate was merged. A separate Copilot page answers Bangla questions and
hands the named issues back to filter the queue.

Five city corporations are modelled: **Gazipur, Dhaka North, Dhaka South, Narayanganj,
Chattogram**. An admin account carries its jurisdiction, and issues are assigned to one
geographically by their own coordinates — so a pin and its ticket can never disagree about
which city they are in.

---

## What Gemma 4 does here

Gemma 4 is not a chatbot bolted onto a CRUD app. It is the entire processing layer, in
**five distinct cognitive roles**. Remove it and there is no product.

| # | Stage | What Gemma 4 does |
|---|---|---|
| 2 | **Triage** | Unstructured Bangla/Banglish/English → strict validated JSON: category, severity 1–5 *with justification*, bilingual summaries, department routing, PII flag |
| 3 | **Evidence verification** *(vision)* | Reads the photo **and** the claim, and judges whether the image actually supports the complaint |
| 4 | **Semantic deduplication** | Decides whether a new report describes the **same physical problem** as a nearby existing issue — across languages and scripts |
| 5 | **Dispatch brief** | Generates a municipal work order: crew, equipment, priority, SLA, plus a citizen-facing Bangla notification |
| 6 | **Councilor's Copilot** *(tool calling)* | Bangla questions → whitelisted tool calls with typed, validated arguments → live queue filter + Bangla narration. The model never emits a raw query string. |

**Gemma 4 is the only LLM in this repository.** Every inference call flows through a single
file — [`server/src/gemma/client.js`](server/src/gemma/client.js) — so the claim is
verifiable at a glance rather than asserted.

Because Gemma 4 is open-weight, the whole system can run on hardware a municipality already
owns: zero per-report cost, and citizen data that never leaves the building. The provider
adapter supports a local Ollama backend; the hosted API is used for demo speed.

---

## Measured results

Two independent harnesses, because they answer different questions. **We report the
pessimistic figures and examine every error rather than rounding it away.**

### Live system — `npm run eval`

38 hand-labelled reports scored against the seeded MongoDB, i.e. the system as deployed.
Full output: [`server/eval/results.md`](server/eval/results.md).

| Metric | Result |
|---|---|
| Category accuracy | 92.1% (35/38) |
| Severity — within ±1 | **100% (38/38)** |
| Severity — exact match | 86.8% (33/38) |
| Dedupe precision / recall / F1 | **1.000 / 1.000 / 1.000** |
| JSON parse success | **100% (67/67 calls)** |
| Latency — triage p50 / p95 | 22.3s / 40.8s |

> Dedupe scores are an upper bound, not a field estimate: the set has intentionally clear
> clusters. Most category "misses" are defensible disagreements (a flooded road labelled
> `water` vs `infrastructure`).

### Engine in isolation — `npm run eval:offline`

An independently written 30-report set, in-memory, no database. Every error is dissected in
[`server/eval/ERROR-ANALYSIS.md`](server/eval/ERROR-ANALYSIS.md).

| Metric | Result |
|---|---|
| Category accuracy | 96.7% (29/30) |
| JSON schema-valid | **30/30** — 0 repair passes, 0 manual-review fallbacks |
| Dedupe precision / recall | 90.9% / 100% (F1 95.2%) |

**By input language — the Bangla-first claim, tested:**

| Language | n | Category accuracy | Severity ±1 |
|---|---|---|---|
| Bangla | 10 | **100%** | 100% |
| Banglish (Latin script) | 6 | **100%** | 100% |
| English | 14 | 92.9% | 100% |

Bangla and Banglish are handled at least as well as English. That is the claim the whole
product rests on.

### Stage 3 on real photographs — `npm run evidence`

16 real photographs, image-only: the model gets the photo and **no text**, and must
identify the civic problem cold. Full per-photo table:
[`server/eval/evidence-results.md`](server/eval/evidence-results.md).

| Metric | Result |
|---|---|
| Evidence matched the genuine claim | **16/16** |
| Unrelated decoy claim correctly rejected | **16/16** |

### Safety behaviours

| Check | Result |
|---|---|
| Prompt-injection attempt | ✅ resisted — ignored injected JSON, triaged the real content |
| PII detection (phone number + name) | ✅ flagged |
| Copilot on an empty result set | ✅ reported "no data" rather than inventing a count |
| Cross-lingual merge | ✅ Bangla + English + Banglish recognised as **one** transformer |

---

## Architecture

```
┌──────────────────────┐        ┌────────────────────────┐
│  Resident PWA        │        │  Councilor Console     │
│  React + Vite        │        │  React + MapLibre GL   │
│  Bangla · photo      │        │  queue · map · copilot │
└──────────┬───────────┘        └───────────┬────────────┘
           │      REST + SSE (live pin drop)│
           └───────────────┬────────────────┘
                           ▼
              ┌────────────────────────────┐
              │  Express API (Node 20+)    │
              │  guards → routes →         │
              │  services → models         │
              └──────┬──────────────┬──────┘
                     ▼              ▼
      ┌────────────────────┐  ┌──────────────────────────┐
      │ MongoDB            │  │ gemma/client.js          │
      │ reports · issues   │  │ ── THE ONLY AI CALL ──   │
      │ citizens · admins  │  │ provider adapter         │
      │ gemma_calls        │  └────────────┬─────────────┘
      │ (2dsphere indexes) │               ▼
      └────────────────────┘  ┌──────────────────────────┐
                              │ Google AI Studio (hosted)│
                              │   or Ollama (offline)    │
                              └──────────────────────────┘
```

### Why submission is asynchronous

Gemma 4 reasons before answering, and **thinking accounts for 75–80% of generated tokens**.
It cannot be disabled on these models (`thinkingConfig` returns HTTP 400), so triage
latency has an irreducible floor around 20s.

Rather than make a citizen watch a spinner, `POST /api/reports` persists the report and
returns **202 in ~100 ms**. The pipeline runs in the background and pushes the finished
issue to the console over SSE. This is both better product design and a better demo — the
pin lands on the map on camera.

### Authentication model

| Role | How they authenticate | What they can reach |
|---|---|---|
| **Resident** | Phone number + 6-digit OTP (demo mode shows the code on screen) | Submit reports; read **only their own** |
| **Admin** | Email + password, issued by `seed:admins` or an invite link | Issues, copilot and stream **for their own corporation** |
| **Anyone** | — | `/api/health`, `/api/transparency` |

Sessions are HS256 JWTs. The server **refuses to boot** if `JWT_SECRET` is missing or under
32 characters, and refuses to boot if `AUTH_DEMO_MODE=true` is paired with a real OTP sender
— that combination would be a log-in-as-anyone oracle. Browser `EventSource` cannot send an
`Authorization` header, so the console trades its token for a short-lived, stream-only ticket.

---

## Getting started

### Prerequisites

- **Node.js 20+**
- **MongoDB** — local, or a free MongoDB Atlas cluster
- **A Gemma 4 provider**, either:
  - a [Google AI Studio](https://aistudio.google.com/) API key (hosted, fastest), or
  - [Ollama](https://ollama.com) ≥ 0.22 with `ollama pull gemma4:e4b` (fully offline)

### Install

```bash
git clone https://github.com/Didhiti0217/Nagorik-Setu-The-Citizen-Bridge.git
```

```bash
cd Nagorik-Setu-The-Citizen-Bridge/server && npm install
```

```bash
cd ../client && npm install
```

### Configure

Copy both example files and fill them in — see
[`server/.env.example`](server/.env.example) and
[`client/.env.example`](client/.env.example) for the annotated full list.

```bash
cp server/.env.example server/.env && cp client/.env.example client/.env
```

| Variable | Purpose |
|---|---|
| `GEMMA_PROVIDER` | `aistudio` · `ollama` · `mock` |
| `GEMMA_MODEL` | e.g. `gemma-4-26b-a4b-it` |
| `GOOGLE_API_KEY` | AI Studio key (only for `aistudio`) |
| `OLLAMA_HOST` / `OLLAMA_MODEL` | the offline path |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | **required** — 32+ chars. `openssl rand -base64 48` |
| `AUTH_DEMO_MODE` | `true` returns the OTP on screen so a judge needs no SIM |
| `ADMIN_SEED` | `<corporationId>:<email>[:<password>]`, `;`-separated |
| `VITE_API_BASE` | API origin for the client (empty in dev — Vite proxies) |

> Both `.env` files are gitignored. Never commit real keys.

### Run

```bash
cd server && npm run seed && npm run seed:admins && npm run dev
```

```bash
cd client && npm run dev
```

The console has **no account until `seed:admins` runs** — that script is the only way one
exists. The server warns loudly at boot if none is found.

### Verify without a database or an API key

```bash
cd server && npm run api:smoke
```

Mounts the real Express app against an in-memory Mongo and a mock Gemma, and runs the full
auth regression suite. No cloud account, no key, no network.

```bash
cd server && npm run gemma:smoke
```

Exercises the Gemma engine end to end against 10 deliberately hostile inputs across all
five stages, printing per-stage latency. Needs a provider; needs no database.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `start` | Run the API (watch / production) |
| `npm run seed` | Seed the synthetic complaint corpus through the **real** pipeline |
| `npm run seed:admins` | Create console accounts from `ADMIN_SEED` — the only way one exists |
| `npm run api:smoke` | Full API + auth regression suite, in-memory, no key needed |
| `npm run gemma:smoke` | Hostile-input test across all five Gemma stages |
| `npm run eval` | Score the live seeded DB → `eval/results.md` |
| `npm run eval:offline` | Score the engine in isolation, no DB |
| `npm run evidence` | Stage 3 validation against real photographs |
| `npm run copilot:check` | Copilot tool-planning check |

---

## API surface

| Method | Route | Who |
|---|---|---|
| `GET` | `/api/health` | public |
| `GET` | `/api/transparency` | public |
| `POST` | `/api/auth/otp/request` · `/otp/verify` | public (resident sign-in) |
| `POST` | `/api/auth/admin/login` | public (console sign-in) |
| `GET` | `/api/auth/me` · `POST /api/auth/logout` | any signed-in user |
| `POST` | `/api/reports` | resident |
| `GET` | `/api/reports/mine` | resident — own reports only |
| `GET` | `/api/issues` · `/api/issues/:id` | admin |
| `POST` | `/api/copilot` | admin |
| `GET` | `/api/stream` | admin, via a short-lived stream ticket |
| `POST` | `/api/auth/admin/invites` · `GET`/`DELETE` | admin |

---

## Project status

Feature-complete and deployed.

- ✅ **Gemma 4 engine** — five stages, provider adapter, schema validation + repair pass, audit logging
- ✅ **Report pipeline** — async intake (202 + SSE), dependency-injected storage
- ✅ **Persistence** — Mongoose models, 2dsphere geospatial indexes, `$geoNear` dedupe
- ✅ **REST API + SSE** — every route guarded, rate limited, error-handled
- ✅ **Authentication** — resident OTP, admin credentials, invite/accept, stream tickets
- ✅ **Resident PWA and councilor console** — Bangla-first, mobile responsive, five corporations
- ✅ **Transparency page** — every raw Gemma call, public
- ✅ **Evaluation** — three harnesses, published numbers, per-error analysis

---

## Repository layout

```
server/
├── src/gemma/
│   ├── client.js          ← the ONLY file that calls a model
│   ├── schemas.js         ← zod contracts for every stage
│   ├── index.js           ← the five stage functions (public surface)
│   └── prompts/           ← one versioned file per stage
├── src/middleware/
│   ├── auth.js            ← the whole authorization surface
│   ├── rateLimit.js       ├── errors.js        └── validate.js
├── src/models/            ← Issue · Report · Citizen · AdminUser · OtpChallenge · AdminInvite
├── src/routes/            ← auth · reports · issues · stream · transparency · copilot
├── src/services/
│   ├── pipeline.js        ← intake → triage → evidence → dedupe → issue
│   └── auth.js            ← OTP, sessions, invites
├── eval/                  ← three harnesses + published results
└── scripts/               ← seed · seed:admins · smoke tests

client/src/
├── pages/                 ← Landing · SignIn · Report · MyComplaints
│                            AdminLogin · InviteAccept · Dashboard · Copilot · Transparency
├── components/            ← Sidebar · MapView · IssueDrawer · CopilotChat · nav
└── lib/                   ← api.js · session.js · corporations.js
```

---

## Documentation

| Document | What it covers |
|---|---|
| [`DEPLOY.md`](DEPLOY.md) | Deploying the API, env vars, provisioning the console account |
| [`client/DEPLOY-FRONTEND.md`](client/DEPLOY-FRONTEND.md) | Deploying the frontend |
| [`docs/plan.md`](docs/plan.md) | Product design, the five-stage engine, execution plan, risk register |
| [`docs/WRITEUP.md`](docs/WRITEUP.md) | The competition writeup |
| [`CLAUDE.md`](CLAUDE.md) | Operating rules — competition constraints, architecture rules, conventions |
| [`docs/progress_participant_1.md`](docs/progress_participant_1.md) | Build log: measured results, findings, decisions |

**Three findings in there worth reading even if you never run this code:**

1. **Gemma 4 returns its reasoning as ordinary `parts[]` entries flagged `thought: true`,
   before the answer.** Joining all parts gives you the reasoning trace instead of the
   JSON — correct output that looks like a parse failure.
2. **Thinking cannot be disabled** on 26B/31B (`thinkingConfig` → HTTP 400) and consumes
   75–80% of output tokens. Too small a `maxOutputTokens` and the model reasons itself out
   of budget and returns nothing.
3. **Few-shot examples make it *faster*** — 597 thought tokens vs 945 without. Examples
   give the model a template, so it reasons less.

---

## Dependencies

**Server** — `express` · `mongoose` · `zod` · `multer` · `cors` · `dotenv` ·
`jsonwebtoken` · `bcryptjs`; `mongodb-memory-server` (dev).
**Client** — `react` · `react-dom` · `react-router-dom` · `maplibre-gl`; `vite` (dev).

**No AI SDK.** The Gemma provider adapter uses `fetch` directly, which keeps the inference
surface small and auditable.

## Data & licensing

No external dataset is used. All demonstration reports are synthetic, written for this
project to reflect realistic Gazipur civic complaints, and processed through the **real**
Gemma 4 pipeline — no model response anywhere in this repository is hardcoded or mocked.

Photographs used for Stage 3 validation are **gitignored**: many are stock or news images
carrying their own licenses. [`server/eval/evidence-results.md`](server/eval/evidence-results.md)
reports only the model's behaviour, never the images themselves.

Code is released under the [MIT License](LICENSE).

## Model attribution

Uses **Gemma 4** by Google DeepMind, under the
[Gemma Terms of Use](https://ai.google.dev/gemma/terms). Gemma 4 is the only large language
model used in this project.
