# Progress — Participant 2 (Dev B, Backend · Data · Deploy)

**Project:** Nagorik Setu (নাগরিক সেতু) · Build with Gemma 4 · Kaggle Bangladesh
**Track:** Dev B — `server/src/{routes,models,lib}/**`, `server/src/{app,index}.js`, `scripts/seed*`, deploy (per [plan.md](plan.md) §6)
**Last updated:** 2026-07-24

---

## ✅ STATUS: backend built, deployed live, and seeded with real data

- **Live API (no login):** https://nagorik-setu-api.onrender.com
  `GET /api/health` → `{"ok":true,"db":"connected","gemma":{"provider":"aistudio","model":"gemma-4-26b-a4b-it"}}`
- **Seed (live, real Gemma):** **38 reports → 17 issues (55% collapsed)**, 0 failures, 21.7 min
- **Cross-lingual dedupe proven live:** 10 Tongi-transformer reports in Bangla / English / Banglish → **one** issue, `reportCount: 10`, top of the queue (P1)
- **Negative control held live:** a co-located "broken overbridge stairs" report stayed a **separate** issue from the garbage pile at the same spot — dedupe is *semantic*, not proximity
- **Audit trail:** 67 real Gemma calls logged (`/api/transparency`), p50 20.0s / p95 36.1s
- **Offline proof (no key, no Atlas):** `npm run api:smoke` → 18/18 · `npm run seed:smoke` → 7/7

Commits (on `farhanishraq17/…` `main`): `49268c1` backend + deploy config · `3d83744` seed corpus + runner

---

## 0. Deployment topology — read this, it is easy to get wrong

- **Render deploys from `farhanishraq17/Gemma---AI---Hackathon-`**, branch `main`, blueprint `render.yaml` at repo root. This is a **different repo** from the `Didhiti0217/…` one named in [progress_participant_1.md](progress_participant_1.md). Local git has both remotes: `origin` = Didhiti0217, `farhan` = the deploy repo. **Push backend work to `farhan main`.**
- **MongoDB Atlas M0:** cluster `cluster0.bmeajze`, db `nagorik-setu`, user `omarhoque4_db_user`. Network Access must include `0.0.0.0/0` for Render's dynamic IPs.
- Credentials live in `atlas-credentials.env` and `secrets.env` at repo root — both gitignored.
- Full deploy walkthrough: [DEPLOY.md](../DEPLOY.md).

---

## 1. What is built

```
server/src/
├── app.js              Express app factory (pure — no DB/listen, so the smoke test reuses it)
├── index.js            entrypoint: connect Mongo, wire setCallLogger→gemma_calls, pipeline→store+SSE, listen
├── lib/
│   ├── db.js           Mongo connect + index build (Issue/Report/GemmaCall)
│   ├── store.js        the 5 injected pipeline deps on Mongo ($geoNear dedupe; $inc/$push patch split)
│   ├── events.js       in-process SSE bus (pipeline publish → dashboard)
│   └── copilotTools.js whitelisted tool executor — the injection boundary (regex-escaped params)
├── models/             Report · Issue (2dsphere + category/priority idx) · GemmaCall
└── routes/
    ├── reports.js      POST 202 + background pipeline; GET /:id status; multipart photo
    ├── issues.js       ranked list · ?format=geojson · /:id
    ├── stream.js       GET /api/stream — SSE (issue:created / issue:updated / report:failed)
    ├── transparency.js last 100 gemma_calls + p50/p95
    └── copilot.js      Stage 6: plan → run whitelisted tool → narrate in Bangla
scripts/
├── seed-corpus.js      ~38 Gazipur reports, deliberate clusters + a co-located control
├── seed.js             runs the corpus through the REAL pipeline; --fresh wipes first
├── seed-smoke.js       offline validation (in-memory Mongo + mock Gemma)
└── api-smoke.js        offline end-to-end (18 checks)
```

**Design boundary:** Dev A's `gemma/**` and `services/pipeline.js` are **untouched**. The pipeline
takes storage as injected dependencies, so `store.js` simply implements that frozen contract
(`findNearbyIssues`, `createIssue`, `updateIssue`, `updateReport`, `publish`).

---

## 2. Endpoints — Dev C builds against these

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/reports` | citizen submit (JSON or multipart `photo`) → `202 {id}` |
| GET | `/api/reports/:id` | poll triage status |
| GET | `/api/issues` | ranked work queue (priorityWeight desc) |
| GET | `/api/issues?format=geojson` | Mapbox layer (FeatureCollection) |
| GET | `/api/issues/:id` | issue detail + merge history |
| GET | `/api/stream` | SSE live updates |
| POST | `/api/copilot` | `{question}` → Bangla answer + tool results |
| GET | `/api/transparency` | last 100 Gemma calls + p50/p95 |
| GET | `/api/health` | liveness + provider + db state |

---

## 3. Seed results (live, real Gemma) — the populated queue

**38 reports → 17 issues · 55% collapsed · 0 failures · 21.7 min · 67 Gemma calls.**

| w | Category | Sev | Reports | Dispatch | Summary |
|---:|---|---:|---:|---|---|
| 95 | hazard | 5 | **10** | P1 DPDC | Sparks from transformer, Tongi Bazar |
| 75 | hazard | 4 | 3 | P1 City Corp Roads | Missing drain cover, Shibbari Road |
| 75 | hazard | 5 | 1 | P1 | Gas smell, Cherag Ali (possible leak) |
| 66 | infrastructure | 5 | **6** | P2 City Corp Roads | Road flooded, Konabari |
| 65 | infrastructure | 4 | 1 | P1 | Large pothole, Joydebpur rail gate |
| 65 | hazard | 4 | 1 | P1 WASA | Open manhole, Mouchak |
| 42 | waste | 3 | **4** | — | Garbage pile, Board Bazar |
| 40 | hazard | 4 | 1 | P2 | Tree fallen on road, Rajendrapur |
| 30 | utility | 2 | 3 | — | Streetlight off, Chandana |
| … | (8 more singletons, sev 2–3) | | 1 | — | water / sanitation / traffic / footpath / overbridge stairs |

The four biggest rows are the intended clusters; the "overbridge stairs" singleton shares Board
Bazar's location with the garbage pile and **correctly stayed separate** (semantic negative control).

---

## 4. Decisions & findings (Dev B)

| # | Decision | Why |
|---|---|---|
| 1 | **Render, not Vercel** | The API holds long-lived SSE connections and keeps processing after `202`; a serverless function kills both. |
| 2 | `$geoNear` (not `$near`) in `store.js` | The pipeline needs `distanceM` per candidate, and a stable order so the model's `candidate_index` is meaningful. |
| 3 | `updateIssue` folds bare fields into `$set` | The pipeline sends mixed patches (`$inc`/`$push` + plain fields); Mongo forbids mixing, so they are split. |
| 4 | Kept the 202 + background design | Matches Dev A's 17s latency floor; SSE drops the pin live — a better demo than a spinner. |
| 5 | Seeded **38**, not the plan's ~120 | Enough for 5 real clusters + a full map, at ~20 min of live Gemma. Re-run `npm run seed` to scale up. |
| 6 | `--fresh` wipe folded in the cleanup | Removed the two earlier manual test docs while repopulating — one clean command. |
| 7 | `mongodb-memory-server` as a dev dep | Lets `api-smoke`/`seed-smoke` prove the whole layer end-to-end with no Atlas and no key. |

---

## 5. Security (Dev B additions)

- **Hardened `.gitignore`.** The onboarding-generated **`atlas-credentials.env` was NOT caught**
  by the old patterns (`credentials*` only matches a prefix; there was no `*.env`) — it showed as
  a committable `??` file with a live DB password. Added `*.env` and `*credentials*`; verified the
  file is now ignored and nothing secret is stageable.
- `server/.env` was composed locally from the credential files to run the seed — gitignored.
- **Rotate** the Atlas password and the Gemma key after the hackathon (neither is in git history).

---

## 6. Handoff to Dev C

- Build the citizen PWA + councilor dashboard against the **live** API above — it is populated
  with 17 real issues **right now**, so no fixtures are needed.
- Map: `GET /api/issues?format=geojson`. Live pin drop: subscribe to `GET /api/stream`.
  Copilot bar: `POST /api/copilot {question}`. Transparency page: `GET /api/transparency`.
- Before submission, set `CLIENT_ORIGIN` (Render env) to the deployed frontend origin (currently `*`).

---

## 7. Next actions (Dev B)

- [ ] **Eval harness** (plan.md §8) — hand-label ~60 of the seeded reports → honest category/severity
      accuracy + dedupe precision/recall + latency table for the writeup.
- [ ] Lock `CLIENT_ORIGIN` to the real frontend origin before submission.
- [ ] (team) Rotate Atlas password + Gemma key post-hackathon.

---

## 8. ⚠️ Doc-sync note

`scripts/sync-docs.mjs` copies the four doc originals from the **parent folder** into `docs/`.
On **this** machine (farhanishraq17) the parent folder has **no doc originals**, so these `docs/`
files are the source of truth and were edited directly. Running sync-docs here fails ("MISSING")
and writes nothing, so direct edits are safe. **But** if Dev A re-runs sync from *their* machine's
parent originals, it will overwrite `progress_participant_1.md` — reconcile these edits into the
parent originals first. (`progress_participant_2.md` is not in the sync list, so it is not at risk.)
