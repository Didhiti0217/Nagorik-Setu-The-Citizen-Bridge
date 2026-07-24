# Progress — Participant 1 (Dev A, Gemma Engine)

**Project:** Nagorik Setu (নাগরিক সেতু) · Build with Gemma 4 · Kaggle Bangladesh
**Track:** Dev A — `server/src/gemma/**`, `server/src/services/**` (per [plan.md](plan.md) §6)
**Repo:** `nagorik-setu/` (its own git repo — strategy docs and `secrets.env` stay OUTSIDE it)
**Last updated:** 2026-07-24, session 1

---

## ✅ STATUS: Gemma engine + pipeline working end-to-end, committed

- Smoke test: **10/10 triage cases clean, 0 repairs, 0 manual-review, 0 exceptions**
- Pipeline: **9 reports → 5 issues (44% duplicate collapse)**, cross-lingual
- Latency investigated, root-caused, and **solved architecturally** (§5)

Commits: `0ebc195` gitignore-first · `96eaf14` engine + pipeline · `05bf4ee` evidence fix · `18c769b` README + LICENSE

**🌐 Public repo — LIVE:** https://github.com/Didhiti0217/Gemma---AI---Hackathon-
`main` pushed 2026-07-24. 17 files, no secrets. Verified: neither the Gemma key nor the
Kaggle token appears anywhere in git history.

> ⚠️ **Only `nagorik-setu/` is pushed.** The parent folder is NOT a git repo and must
> never become one — it holds `secrets.env` (live Kaggle token + Gemma API key),
> `plan.md`, `CLAUDE.md`, and these progress notes. Running `git init` in
> `C:\Projects\Gemma-Hackathon\` would stage the secrets file. Don't.

### 📄 Doc workflow — read before editing any doc

`CLAUDE.md`, `plan.md`, `progress_participant_1.md` and `Competition-Link.txt` exist in
**two places**. The parent folder holds the **editable originals**; `nagorik-setu/docs/`
holds **generated copies** that get published to GitHub.

Edit the parent copies. Then, from the repo root:

```bash
node scripts/sync-docs.mjs
```

It copies parent → `docs/`, reports what changed, and **refuses to copy any file
containing a credential-shaped string** (verified: planting a real key makes it exit 1).
Never hand-edit `nagorik-setu/docs/` — the next sync overwrites it.

---

## 0. 📊 Completion tracker

> Update this table at every integration checkpoint (plan.md §6: H+10 / H+20 / H+30).

### By build effort — **≈20% complete**

| Component | Owner | Status | Weight | Done |
|---|---|---|---|---|
| Gemma engine — 5 stages, adapter, schemas, prompts | A | ✅ complete | 15% | 15% |
| Pipeline service (async, DI storage) | A | ✅ complete (on stubs) | 5% | 5% |
| Mongo models + 2dsphere + routes + SSE | B | ⬜ not started | 20% | 0% |
| Citizen PWA (Bangla, photo, geo) | C | ⬜ not started | 12% | 0% |
| Councilor dashboard + Mapbox + copilot UI | C | ⬜ not started | 18% | 0% |
| Seed corpus (~120 reports through the real pipeline) | B | ⬜ not started | 5% | 0% |
| Deployment (Vercel / Render / Atlas) | B | ⬜ not started | 5% | 0% |
| Eval harness + benchmark table | A | ⬜ not started | 5% | 0% |
| Demo video (≤3 min) | C | ⬜ not started | 7% | 0% |
| Writeup + README + Kaggle notebook | all | ⬜ not started | 8% | 0% |
| | | | **100%** | **20%** |

### By rubric points — **≈40 / 100 secured**

| Criterion | Max | Secured | Reasoning |
|---|---|---|---|
| Gemma Integration | 30 | **~24** | Engine built *and empirically proven*: 5 stages, multimodal, injection-resistant, measured. Remaining 6 pts = making it visible in the demo and writeup. |
| Innovation & Impact | 30 | **~12** | Differentiators designed; the hardest one (cross-lingual dedupe) is working. But a judge cannot see any of it without the app. |
| Functionality | 20 | **~3** | No demo URL, no UI. **Largest exposure.** |
| Presentation & Writeup | 20 | **~1** | Nothing written yet. |

### Reading the gap

The completed 20% is deliberately the **highest-risk, highest-differentiation** 20%.
Every unknown is now resolved: audio settled, thinking-mode trap found, latency
root-caused, dedupe proven on real data. **Nothing remaining on the critical path is
research** — it is MERN CRUD, a map, and writing.

But the arithmetic is unforgiving: **~44 hours left with ~80% of the build untouched**,
and Functionality + Presentation are 40 points sitting at 4.

**The two highest-leverage moves right now:**
1. **Deploy a hello-world today.** Worth more than any feature — it converts deployment
   from an end-of-project risk into a solved problem.
2. **Teammates start now.** Three parallel tracks is what makes 80%-in-44-hours work.
   Sequential, it does not.

---

## 1. Environment

| Tool | Status |
|---|---|
| Node | ✅ v24.18.0 (installed this session via winget — was missing) |
| npm | ✅ 11.16.0 |
| git | ✅ repo initialised at `nagorik-setu/` |
| Python | ✅ 3.14 (not needed — no Python service, see plan.md §5) |
| Ollama | ❌ not installed (deferred; only needed for the offline demo shot) |
| MongoDB | ⬜ not yet — Dev B owns this |

**Security:** `.gitignore` was **commit #1**, before any other file existed. Verified
`server/.env` and `secrets.env` are both ignored. The Kaggle token and the Gemma key
are not in git history. Still rotate both after the hackathon.

---

## 2. ⚠️ Critical findings — these cost hours if rediscovered

### 2.1 Our API key exposes only TWO Gemma 4 models

`ListModels` returns exactly: **`gemma-4-26b-a4b-it`** and **`gemma-4-31b-it`**.
E2B / E4B / 12B are **not available** on this key. `gemma-4-e4b-it` → HTTP 404.

### 2.2 ⛔ Audio is therefore OFF THE TABLE

Audio on Gemma 4 exists only on **E2B / E4B / 12B** — precisely the three variants we
cannot reach. The 26B and 31B models we *can* reach are text + image only.

Combined with the earlier research finding that local audio is demo-fatal
(`gemma4:e2b` measured at **5m35s for a 10-second clip**, hallucinating and stalling
outright at 47s), **voice input is cut**. This is the H+2 go/no-go gate from plan.md §1,
resolved by evidence rather than guesswork.

*This is why the spike was scheduled first. It cost 40 minutes instead of a day.*

**Consequence for the plan:** the accessibility story shifts from "speak your complaint"
to "photo + Bangla text, no forms, no categories, no literacy requirement beyond typing."
The Gemma-Integration argument is unaffected — it never rested on modality count.

### 2.3 ⛔ Gemma 4 always thinks, and thoughts arrive as ordinary parts

The single most expensive trap found. The API returns reasoning as `parts[]` entries
flagged `thought: true`, **before** the real answer part. Naively joining all parts hands
you the reasoning trace instead of the JSON — output that was actually perfect looks like
a parse failure.

```js
// WRONG — returns the reasoning trace
parts.map(p => p.text).join('')
// RIGHT
parts.filter(p => p.thought !== true).map(p => p.text).join('')
```

Thinking **cannot be disabled** on these models:
- `generationConfig.thinkingConfig` → `400 "Thinking budget is not supported for this model"`
- top-level `thinkingConfig` → `400 "Unknown name"`

Thought tokens are billed against `maxOutputTokens`. Measured: **453 thought tokens for a
71-token answer.** With `maxOutputTokens: 1024` the model can think itself out of budget
and return *nothing*. Defaults are now 2048, and per-stage budgets are set in `gemma/index.js`.

### 2.4 Confirmed working

- ✅ Vision — `inline_data` accepted, IMAGE modality tokens counted (258 for a test image)
- ✅ `responseMimeType: application/json` accepted (no 400)
- ✅ `systemInstruction` accepted (contrary to older Gemma-on-Gemini behaviour)
- ✅ Bangla comprehension and Bangla *generation* are genuinely good

---

## 3. What is built

```
nagorik-setu/server/
├── .env / .env.example          ✅  (.env gitignored)
├── package.json                 ✅  express, mongoose, zod, multer, cors, dotenv
├── src/gemma/
│   ├── client.js                ✅  THE ONLY FILE THAT CALLS A MODEL
│   ├── schemas.js               ✅  zod contracts — FROZEN, Dev B/C build against these
│   ├── index.js                 ✅  the 5 stage functions (public surface)
│   └── prompts/
│       ├── triage.js            ✅  triage@3   — 4 few-shot, bn/Banglish/phonetic
│       ├── evidence.js          ✅  evidence@2 — photo vs claim
│       ├── dedupe.js            ✅  dedupe@2   — same physical problem?
│       ├── dispatch.js          ✅  dispatch@2 — work order + Bangla SMS
│       └── copilot.js           ✅  copilot@2  — tool calling + narration
└── scripts/gemma-smoke.js       ✅  10 hostile inputs + all 5 stages
```

`client.js` provides: provider adapter (aistudio | ollama | mock), timeout, retry with
jittered backoff, thought-part filtering, balanced-brace JSON extraction, a one-shot
repair pass, and an injectable audit logger (no DB coupling — `eval/` and scripts run
without Mongo).

---

## 4. Smoke test results (2026-07-24, `gemma-4-26b-a4b-it`)

**Triage — 10/10 usable, 0 repaired, 0 manual review, 0 threw.**

| Input type | Result |
|---|---|
| Pure Bangla, live wire | ✅ hazard, sev 5, Fire Service, life=true |
| Banglish code-switch | ✅ water, sev 3, WASA |
| Phonetic Bangla in Latin | ✅ infrastructure, sev 5, life=true |
| Terse fragment ("ekta street light noshto") | ✅ utility, sev 1 |
| Run-on, multiple issues | ✅ sanitation, sev 4 |
| Near-empty ("help") | ✅ degraded gracefully, sev 1 |
| Contains phone number + name | ✅ **pii_present=true** |
| **Prompt injection attempt** | ✅ **DEFEATED** — ignored the injected JSON, triaged the real content as sev 1 |

**Stage 4 dedupe:** ✅ correct merge *and* ✅ correct negative control (refused to merge a
water outage with an electrical hazard 30 m away).

**Stage 5 dispatch:** ✅ P1 / DPDC / SLA 1h, 4-person crew, equipment list, fluent
operational Bangla + English briefs, polite citizen SMS that avoids promising a fix time.

**Stage 6 copilot:** ✅ Bangla question → `aggregate_by_category{days:7, area:"Tongi"}`.
English question → `query_issues{min_severity:5, status:"open"}`.
⚠️ One miss: it chose `category:"utility"` for "electrical", where `hazard` was arguably
right. Category hinting needs a tweak — logged in §6.

> The injection result and the dedupe negative control are both **writeup material** —
> they are exactly the "is this real engineering?" evidence the rubric rewards.

---

## 4b. Pipeline demo — the core impact claim, verified

`node scripts/pipeline-demo.js` (in-memory storage, real Gemma calls):

**9 citizen reports → 5 issues. 44% of the queue collapsed.**

| Issue | Category | Sev | Reports | Priority |
|---|---|---|---|---|
| Transformer sparking, Tongi Bazar | hazard | 5 | **4** | P1 · DPDC · SLA 1h |
| Missing drain cover, Shibbari Rd | hazard | 4 | 1 | P1 · WASA · SLA 4h |
| Road flooded, Konabari | infrastructure | 4 | **2** | P2 · Roads · SLA 12h |
| Streetlight off, Chandana | utility | 2 | 1 | — |
| Garbage pile, Board Bazar | waste | 2 | 1 | — |

The four merged Tongi reports were written in **Bangla, English, and phonetic
Banglish** — the model recognised them as one physical transformer across three
scripts. Nearby-but-unrelated issues were correctly kept separate.

> **This is the single strongest demo beat and writeup claim in the project.**
> Cross-lingual semantic deduplication is something no keyword or embedding
> baseline does well, and it is pure Gemma reasoning.

---

## 4c. Stage 3 vision — verified on real image bytes

Real PNG bytes (generated, not stock) survive base64 → `inline_data` → model.

| Case | supports_claim | confidence | Verdict |
|---|---|---|---|
| Solid blue field vs "huge pothole" claim | false | 0 | ✅ correct rejection |
| Dark textured graphic vs "pothole" claim | false | 0 | ✅ correct rejection |

**Vision is FAST: ~3.3s**, vs 17–25s for text triage. Short answers mean less
thinking. Evidence verification is nearly free on the latency budget.

**Bug found and fixed** (`05bf4ee`): the model returned `supports_claim=false`
with `evidence_confidence=1.0` — it read the field as "confidence in my verdict"
instead of "confidence the photo supports the claim". That would have rendered
in the UI as a mismatched issue showing 100% evidence. Fixed in the prompt
(explicit scale + "false ⇒ 0.0") and normalised in code as a belt-and-braces
guard.

> ⚠️ **Still needed from the team: real Gazipur complaint photos.** The synthetic
> images were correctly identified as "non-photographic graphics", so the
> *ambiguous-photo* path is still unproven. Team action: photograph 8–10 real
> civic problems (pothole, garbage pile, broken streetlight, flooded road,
> exposed wire). These double as demo and video material.

---

## 5. ✅ Latency — root-caused and solved

**Measured:** p50 20.8s, p95 35s per triage call; 20–80s per full pipeline run.

**Root cause (experiment, `scratchpad/latency.mjs`):**

| Config | Latency | thought tok | answer tok |
|---|---|---|---|
| 26b-a4b, full prompt + few-shot | 17.0s | 597 | 149 |
| 26b-a4b, terse prompt, no few-shot | 22.0s | 771 | 225 |
| 26b-a4b, no Bangla output field | 15.2s | 580 | 104 |
| 31b, full prompt + few-shot | 24.7s | 650 | 186 |

**Thinking is 75–80% of all generated tokens and cannot be disabled.** Two
counter-intuitive results worth keeping:

1. **Few-shot examples make it FASTER** (597 vs 771–945 thought tokens). Examples
   give the model a template so it reasons less. Keep them — they help quality
   *and* speed.
2. **Dropping Bangla output saves only ~2s.** Not worth losing the Bangla-first
   story. 31B is slower than the 26B MoE, as expected from active-param count.

**Conclusion: ~17s is the floor. It is an architecture problem, not a tuning one.**

**Solution — adopted, implemented in `services/pipeline.js`:**
`POST /api/reports` persists the raw report, returns **202 immediately** (~100ms
to the citizen), and processes in the background. SSE pushes the pin to the
dashboard when triage completes.

This is the correct design for a civic app regardless of latency, and it makes
the demo *better*: the video cuts from phone to dashboard and the pin lands on
camera, which beats filming a spinner.

---

## 6. Handoff — contracts are FROZEN (plan.md §6)

**Dev B** — build routes against `server/src/gemma/schemas.js`. Import stage functions
from `server/src/gemma/index.js` **only**. Never import `client.js` directly.

```js
import { triageReport, verifyEvidence, findDuplicate,
         generateDispatchBrief, planCopilotQuery,
         narrateCopilotAnswer, setCallLogger } from './gemma/index.js';
```

Every stage returns `{ data, meta }`. `meta` carries `latencyMs`, `provider`, `model`,
`repaired`. Wire `setCallLogger()` at boot to persist `gemma_calls` → Transparency page.

`triageReport`, `verifyEvidence` and `findDuplicate` **never throw** — they degrade to
`manualReview` / `unverified` / `not-duplicate`. `generateDispatchBrief` and the copilot
stages *can* throw; wrap them.

**Dev C** — the exact JSON shapes for fixtures are in `schemas.js`. Real sample outputs
are in the smoke-test log above; copy them verbatim as fixtures.

---

## 7. Next actions (Dev A)

- [x] ~~Latency fix~~ → root-caused, solved architecturally (§5)
- [x] ~~`services/pipeline.js`~~ → built and verified (§4b)
- [x] ~~Vision plumbing + negative path~~ → verified, bug found and fixed (§4c)
- [ ] **Real-photo validation** — blocked on the team supplying 8–10 real Gazipur
      complaint photos. Synthetic images can't exercise the ambiguous path.
- [ ] Fix copilot category hinting ("electrical" → chose `utility`, `hazard` was better)
- [ ] Eval harness (plan.md §8) — hand-label 60 reports, publish honest metrics
- [ ] Ollama install for the offline-proof video shot (video-only, low priority)

### ⚠️ Blocking on other tracks

| Need | Owner | Why it blocks |
|---|---|---|
| MongoDB Atlas URI + Mongoose models | Dev B | Pipeline runs on in-memory stubs today; needs the real `$near` implementation |
| Express routes + SSE | Dev B | `publish()` is stubbed; the live pin drop is the key demo shot |
| Deploy hello-world | Dev B | plan.md says H+3. Do not let this slip. |
| Fixtures from §4/§4b outputs | Dev C | Sample JSON is in the logs above — copy verbatim |

## 8. Decisions log

| # | Decision | Why |
|---|---|---|
| 1 | App lives in `nagorik-setu/` as its own repo | Public repo must not contain `secrets.env`, the strategy PDF, or plan.md |
| 2 | `.gitignore` as commit #1 | A key in git history cannot be un-published |
| 3 | Provider = AI Studio, model = `gemma-4-26b-a4b-it` | Only two models available; the MoE has 3.8B active params, so it's the faster of the two |
| 4 | **Audio cut** | Unavailable on reachable models; local path is demo-fatal (§2.2) |
| 5 | No Python/FastAPI service | Second runtime, second failure mode, zero rubric points |
| 6 | Dedupe biased toward *not* merging | A false merge silently buries a real problem; a duplicate ticket costs an officer 2 seconds |
| 7 | Evidence check biased toward *supports_claim* | An over-eager fraud detector would suppress reports from the low-literacy citizens this product exists for |
| 8 | **Submission is async (202 + SSE)** | 17s is Gemma's latency floor and cannot be tuned away (§5). Also the correct civic-app design, and a better demo shot than a spinner. |
| 9 | Keep the 4 few-shot examples | Measured: they *reduce* thought tokens 597 vs 945, so they improve quality **and** latency |
| 10 | Dispatch brief gated at severity ≥ 4 | Most expensive call in the pipeline (~22s); pointless on a broken streetlight |
