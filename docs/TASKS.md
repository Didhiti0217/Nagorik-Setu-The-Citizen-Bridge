# Remaining tasks — Nagorik Setu

**As of 2026-07-24 · build ~85% complete · ~63/100 rubric points secured**
**Deadline: between 48 and 72 hours from 2026-07-24 09:00 Dhaka. Plan against 48.**

Owners: **P1** = Participant 1 (Dev A, Gemma engine) · **P2** = Farhan (Dev B, backend/deploy) ·
**P3** = third teammate (now free — Dev C's build is done)

---

## 🔴 Blocking chain — do these in order, nothing else unblocks without them

| # | Task | Owner | Est. | Blocked by | Why it matters |
|---|---|---|---|---|---|
| 1 | **Redeploy the API on Render** to pick up the CORS fix (`344aca9`) | **P2** | 10 min | — | The live API sends **no `Access-Control-Allow-Origin` header**. It looks healthy to `curl` and fails in every browser. Until this ships, *any* hosted frontend shows an empty dashboard. |
| 2 | Verify CORS is fixed: `curl -i -H "Origin: https://example.com" .../api/health` must show `access-control-allow-origin` | P2 | 5 min | 1 | Don't assume the redeploy worked. |
| 3 | **Deploy the frontend** (Vercel/Netlify), set `VITE_API_BASE=https://nagorik-setu-api.onrender.com` | user | 10 min | 2 | Config is DONE (`client/vercel.json`, `netlify.toml`, `DEPLOY-FRONTEND.md`) — one import + one env var. The deploy itself needs a hosting account login. This is the demo URL judges click. **6 of 20 Functionality points.** |
| 4 | Open the deployed URL in a **private window** — no login, no paywall | P1 | 5 min | 3 | Explicit competition rule. A demo that needs auth is disqualified. |

---

## 🟠 Highest points-per-hour — start in parallel with the above

| # | Task | Owner | Est. | Points | Notes |
|---|---|---|---|---|---|
| 5 | ~~Kaggle writeup, ≤1,500 words~~ ✅ **DONE** — `docs/WRITEUP.md`, 1,375 words | P1 | — | **~18 of 20** | All required sections; discloses the synthetic corpus and untested Stage 3. Needs one human pass + paste into Kaggle. |
| 6 | **Demo video, ≤3 min** | P3 | 3 h | ~6 | Shot list in `plan.md` §9. The live SSE pin-drop now genuinely works — film it in one unbroken take. **Only a human can record this.** |
| 7 | ~~Kaggle notebook~~ ✅ **DONE** — `notebook/nagorik-setu-gemma4.ipynb` | P1 | — | required | Runnable; both code cells verified against the live API. Upload to Kaggle as-is. |

---

## 🟡 Credibility — cheap, high-trust

| # | Task | Owner | Est. | Why |
|---|---|---|---|---|
| 8 | **Photograph 8–10 real Gazipur problems** (pothole, garbage, streetlight, flooded road, exposed wire) | P3 | 1 h | Stage 3 evidence verification is a headline feature **never tested on a real photograph**. Highest-value hour available. Doubles as video material. |
| 9 | **Each teammate submits 2–3 real reports** through the deployed app | all | 15 min | 3 | Changes the claim from "we simulated it" to "we used it". |
| 10 | Re-run `npm run eval` after the real submissions | P1 | 20 min | — | Refreshes `results.md` with data that isn't purely synthetic. |

---

## 🟢 Submission mechanics — do NOT leave to the last hour

| # | Task | Owner | Est. | Notes |
|---|---|---|---|---|
| 11 | **Confirm the exact deadline** on Kaggle → Overview → Timeline | any | 2 min | Currently only known to ±24 h. Most important unknown in the project. |
| 12 | README final pass — add live demo URL + 2–3 screenshots | P1 | 30 min | First thing a judge sees on the repo. |
| 13 | Rule-compliance grep (`CLAUDE.md` §1) — Gemma 4 must be the only LLM | P1 | 10 min | Disqualification risk. |
| 14 | Verify repo is public and stays public through judging | P2 | 5 min | Explicit rule. |
| 15 | **Submit the Writeup — click Submit, not Save** | P1 | 10 min | Drafts are **not judged**. Verify it shows as submitted. |
| 16 | Fill in the **Google Form** after the Kaggle submission | P1 | 5 min | Required by the rules. |

---

## 🔵 Housekeeping / risk

| # | Task | Owner | Est. | Notes |
|---|---|---|---|---|
| 17 | Move `secrets.env` outside the repo root (e.g. `C:\Projects\.secrets\`) | P1 | 10 min | It is gitignored and has never been committed — verified — but it now sits *inside* the repo root. One `git add -f` from publishing a live credential. |
| 18 | Move `.git` from `nagorik-setu\` to the project root | **user** | 1 min | `mv "C:/Projects/Gemma-Hackathon/nagorik-setu/.git" "C:/Projects/Gemma-Hackathon/.git"`. Until then plain `git` commands fail from the project folder. Needs the user — the tooling blocks it. |
| 19 | Rotate the Kaggle token and Gemma API key | user | 5 min | **After** judging. Both were shared in plaintext during development. |
| 20 | Update `docs/progress_participant_1.md` completion tracker | P1 | 10 min | Currently says 55%; actual is ~85%. |

---

## What must be true to submit

- [ ] Public GitHub repo with README, install instructions, dependency list
- [ ] Public demo URL, **verified in a private window**
- [ ] Runnable Kaggle notebook
- [ ] Demo video ≤ 3:00, publicly viewable
- [ ] Writeup ≤ 1,500 words with repo + demo attached under Attachments → Project Links
- [ ] **Clicked Submit** (not Save)
- [ ] Google Form completed
- [ ] Gemma 4 is the only LLM anywhere in the repo
- [ ] Synthetic demonstration corpus **disclosed** in the writeup

---

## Honest note on scope

Everything remaining is **packaging, not engineering**. The engine, backend, pipeline and
UI are built and measured. Packaging is exactly what hackathon teams run out of time for,
which is why `plan.md` reserves the final 8 hours for it.

Two things are worth saying plainly in the writeup rather than hoping nobody checks:

1. **The 38 reports are synthetic** — hand-written to exercise cross-lingual deduplication.
   Every AI-derived field is produced by the real pipeline; no model output is hardcoded.
2. **Stage 3 (photo evidence) has not been tested on a real photograph.** Task 8 fixes this.

Claiming both openly costs almost nothing and buys credibility. An experienced judge who
opens `seed-corpus.js` will find it in thirty seconds either way.
