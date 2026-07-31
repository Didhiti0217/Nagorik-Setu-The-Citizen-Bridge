# plan.md — Nagorik Setu (নাগরিক সেতু)
### Build with Gemma 4 · Kaggle Community Hackathon Bangladesh · Target: 1st place
### Team of 3 · ~48 hours · Deadline ≈ 2026-07-26

---

## 0. Situation report

| | |
|---|---|
| Deadline | ≈ **2026-07-26** (page read "2 days to go" on 2026-07-24) |
| Field | **5 teams · 6 submissions · 92 entrants** — a small field for a $2,000 pool |
| Prizes | 1st **$1,000** · 2nd $600 · 3rd $400 |
| Team | 3 members (max allowed). **One** submission, editable until deadline. |
| Status | Registered ✅ |

**Rubric (official):** Gemma Integration **30** · Innovation & Impact **30** · Functionality **20** · Presentation & Writeup **20**.
**Binding constraint:** Gemma 4 must be the *only* LLM anywhere in the project.

With three people and a small field, the realistic goal is not "submit something good" — it's to be the only team that ships something a judge would mistake for a real product.

---

## 1. Critical intel — read this before writing code

Researched 2026-07-24 against live sources. This intel is worth several hours of the build.

### Gemma 4 lineup (from the official model card)

| Variant | Params | Inputs | Context |
|---|---|---|---|
| E2B | 2.3B eff. | text · image · **audio** | 128K |
| **E4B** | 4.5B eff. | text · image · **audio** | 128K |
| 12B Unified | 11.95B | text · image · **audio** | 256K |
| 26B A4B (MoE) | 3.8B active | text · image | 256K |
| 31B Dense | 30.7B | text · image | 256K |

Native **structured output** and **function calling** for agentic workflows. 140+ languages (Bangla included). **Put image/audio content *before* text in the prompt.** Audio capped at **30 seconds**.

### Access paths

- **Ollama** (local, free, offline): `ollama pull gemma4:e4b`, requires **Ollama ≥ 0.22**. ~5 GB RAM at 4-bit.
- **Google AI Studio / Vertex** (hosted, free tier ~15 RPM): model IDs `gemma-4-e4b-it`, `gemma-4-e2b-it`, `gemma-4-12b-it`, `gemma-4-26b-a4b-it`, `gemma-4-31b-it`. Image input documented via `types.Part.from_bytes(...)`.

### ⚠️ The three landmines

1. **Ollama's native `/api/chat` silently ignores audio.** An `audios` field produces no error — the model simply reports no audio was provided. Audio must go through the **OpenAI-compatible `/v1/chat/completions`** endpoint using `{"type":"input_audio","input_audio":{"data":"<base64>","format":"wav"}}`. This would have cost hours to discover.
2. **Local audio is not demo-viable.** Hands-on testing of `gemma4:e2b` on an 8 GB Mac: **5m35s to process a 10-second clip**, looping/hallucinated transcription, and a total stall on 47 seconds. llama.cpp currently rejects Gemma 4 audio outright (`audio input is not supported — hint: you may need to provide the mmproj`), and adding the mmproj does not fix it.
3. **Hosted audio support is undocumented.** `gemma-4-e4b-it` is served on AI Studio and image input is documented, but *no source documents audio input through the hosted API*. It plausibly works via `Part.from_bytes(mime_type="audio/wav")`, but that is a hypothesis. **It must be tested empirically, in the first hour, by someone who is not on the critical path.**

### The decision this drives

**Audio is a Tier-1 flagged feature, not the core.** The 30 Gemma-Integration points come from the model being *architecturally load-bearing*, not from counting modalities. Our core — evidence verification, semantic deduplication, tool-calling copilot — already makes Gemma impossible to remove. Audio, if the spike succeeds, is a headline accessibility feature and a great demo beat. If it fails, we cut it at H+2 and the architecture doesn't move.

**Go/no-go gate at H+2. Decision rule:** ship audio only if end-to-end latency is **under 8 seconds** for a 15-second Bangla clip *and* transcription is faithful enough to triage correctly on 5 of 5 test clips. Otherwise cut, no debate, no second attempt.

---

## 2. Where the 100 points come from

| Criterion | Pts | The argument we're making to the judge |
|---|---|---|
| **Gemma Integration** | 30 | One 4B open model performs **five distinct cognitive roles** — structured triage, visual evidence verification, semantic duplicate reasoning, agentic dispatch generation, and text-to-geospatial-query tool calling — across **text, image, and (if the spike passes) audio**. No separate classifier, no rules engine, no second model. Delete Gemma and there is no product. A live Transparency page shows every raw call. |
| **Innovation & Impact** | 30 | The insight: **civic complaint systems don't fail at collection, they fail at triage.** Duplicates, unverifiable claims, no prioritisation. We use a vision-language model for first-pass evidence triage and semantic dedupe — nothing in Bangladeshi civic tech does this. Bangla-first. Runs offline on hardware a city already owns: zero per-report cost, citizen data never leaves the building. |
| **Functionality** | 20 | A public URL with no login, seeded by the **real** pipeline, a live end-to-end submission in the video, and graceful degradation on every model call. |
| **Presentation & Writeup** | 20 | Exactly the section list the rules name, an architecture diagram, a **measured benchmark table**, and an honest limitations section. ≤3-min video that states the problem in 12 seconds. |

**The pitch — memorise it, it opens the video and the writeup:**

> *Nagorik Setu turns thousands of chaotic Bangla complaints into a short, ranked, de-duplicated, photo-verified work queue for a city corporation — powered end-to-end by a single 4-billion-parameter open model running offline on one laptop.*

---

## 3. The product

**Citizen (mobile web, Bangla).** One screen: type or speak in Bangla, snap a photo, submit. Geolocation is automatic. Confirmation screen shows *what Gemma understood* — which is itself a trust feature and demos beautifully.

**Ward councilor (desktop dashboard).** A live map of **issues** (deduplicated), not raw reports. Severity-coloured pins, heatmap at low zoom, ranked work queue, dispatch brief per issue, SLA countdown, and a **Bangla natural-language command bar** that reshapes the map.

**Setting:** Gazipur City Corporation — Bangladesh's largest city corporation by area, densely industrial, chronically under-resourced. Specific and checkable beats generic.

---

## 4. The Gemma 4 engine

Model: **`gemma4:e4b`** locally / **`gemma-4-e4b-it`** hosted. One model, five roles.

**Why E4B — the "why this size" answer judges reward:** it is the smallest Gemma 4 that is multimodal *and* small enough to run on the laptop a municipal office actually owns. That's not a compromise, it's the thesis — civic data is sensitive and municipal budgets are thin, so the model must be free, local, and private. A 31B model earns zero extra rubric points and kills the offline story.

### Stage 1 — Intake
Photo + Bangla/Banglish text (+ audio if the spike passes). Multimodal parts **before** text.

### Stage 2 — Triage & structuring (constrained JSON)

```json
{
  "category": "infrastructure|utility|sanitation|hazard|water|waste|traffic",
  "severity": 4,
  "urgency_reason": "sparking live wire in a public market at peak hours",
  "summary_bn": "টঙ্গী বাজারের সামনে বিদ্যুতের তার ছিঁড়ে পড়েছে",
  "summary_en": "Live power line down at Tongi market entrance",
  "inferred_location": "Tongi Bazar main entrance",
  "landmark_confidence": 0.86,
  "department": "DPDC|City Corp Roads|WASA|Waste Mgmt|Fire Service",
  "action_required": "immediate_dispatch|scheduled_maintenance|monitor",
  "is_life_threatening": true,
  "estimated_affected_people": 400,
  "language_detected": "bn",
  "pii_present": false
}
```

`urgency_reason` earns its place: forcing the model to justify the severity score improves calibration *and* gives the councilor an auditable reason instead of an opaque number.

### Stage 3 — Photo-evidence verification ⭐ *innovation hook*
Gemma receives the photo **and** the claim: *does this image support this complaint?* Returns `evidence_confidence` (0–1), `visible_elements[]`, `mismatch_reason`.

Every civic complaint system on earth drowns in unverifiable reports and solves it with human review. This is a VLM doing first-pass evidence triage — only possible because Gemma 4 is natively multimodal.

### Stage 4 — Semantic duplicate clustering ⭐ *impact hook*
MongoDB `$near` pulls candidate issues within 150 m / 72 h → Gemma decides **"same physical problem or different?"** with a reason. Same → merge, increment `reportCount`, raise priority. Different → new Issue.

**Forty complaints about one broken transformer become one ticket weighted forty.** This is reasoning, not extraction — exactly the evidence for "is the model core?"

### Stage 5 — Agentic dispatch brief (function calling)
Above a severity threshold, Gemma generates a municipal work order — what, where, crew and equipment, priority justification, SLA hours — plus a citizen-facing **Bangla SMS**. Native tool-use selects the department.

### Stage 6 — The Councilor's Copilot ⭐ *the demo moment*
Councilor types in Bangla: *"গত সাত দিনে টঙ্গীতে কোন সমস্যা সবচেয়ে বেশি?"* Gemma uses **function calling against a whitelisted tool schema** (`query_issues`, `aggregate_by_category`, `find_hotspots`) to emit safe parameterised queries. Backend executes → **map re-renders live** → Gemma narrates in Bangla.

> **The model never emits raw query strings.** It selects from a fixed schema with typed, validated parameters. That's the injection defence *and* a talking point for the writeup.

---

## 5. Architecture

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
          │  Express API (Node 20)    │
          │  routes → services        │
          └───────┬───────────┬───────┘
                  ▼           ▼
   ┌──────────────────┐   ┌────────────────────────┐
   │ MongoDB Atlas    │   │ gemma/client.js        │
   │ reports          │   │ ── THE ONLY AI CALL ── │
   │ issues (2dsphere)│   │ provider adapter       │
   │ gemma_calls      │   └──────────┬─────────────┘
   └──────────────────┘              ▼
                        ┌──────────────────────────┐
                        │ ollama gemma4:e4b  (local)│
                        │ AI Studio gemma-4-e4b-it  │
                        └──────────────────────────┘
```

**Deliberate cut vs. the original draft:** no Python/FastAPI microservice. Ollama *is* an inference server with a clean HTTP API; a Python layer adds a second runtime, a second deploy target, and a second failure mode for zero rubric points. `gemma/client.js` gives the same architectural boundary in one file.

### Collections

**`reports`** — `{ _id, rawText, audioPath?, photoPath, location:{type:"Point",coordinates:[lng,lat]}, gemmaOutput, evidenceCheck, issueId, status, createdAt }`

**`issues`** — `{ _id, centroid:GeoJSON Point, category, severity, priorityWeight, reportCount, summaryBn, summaryEn, department, dispatchBrief, slaDueAt, status, evidencePhotos[], mergeReasons[], createdAt, updatedAt }`

**`gemma_calls`** — `{ _id, stage, promptVersion, model, provider, modalities[], latencyMs, tokensIn, tokensOut, rawResponse, parsedOk, repairAttempted, createdAt }`

Indexes: `2dsphere` on `reports.location` and `issues.centroid`; `{category:1, createdAt:-1}` on issues.

### Transparency page — REMOVED, superseded by the eval harness
The original plan was `/transparency`, an in-app page rendering the last 100 `gemma_calls`
raw. It was later removed entirely (page, route, nav links). The same evidence-of-realness
argument — *"is this real or faked for the demo?"* — is now made by §8's eval harness: three
independently-run scoring passes against the same `gemma_calls` collection, published as a
results table in the README rather than left for a judge to click through live.

---

## 6. Team split — three parallel tracks

The whole plan depends on **contracts being frozen at H+2** so nobody blocks anybody. Agree the JSON shapes and API routes first, then never renegotiate them mid-build.

### 🔵 Dev A — Gemma Engine (the critical path)
Owns `server/src/gemma/**` and `server/src/services/**`.
Provider adapter, all five prompt stages, JSON schema + repair pass, `gemma_calls` logging, tool schema for the copilot.
**Nobody else touches these files.**

### 🟢 Dev B — Backend, Data & Deploy
Owns `server/src/{routes,models,lib}/**`, `scripts/seed.js`, deployment, README, Kaggle notebook.
Mongoose schemas + geospatial indexes, REST routes, SSE, dedupe candidate query, seed corpus, Vercel/Render/Atlas deploy.
**Deploys a hello-world to production at H+3** — not at H+30 — so the pipeline is proven early.

### 🟡 Dev C — Frontend & Story
Owns `client/**`, the video, and design.
Citizen PWA, councilor dashboard, Mapbox layers, copilot UI, transparency page, i18n.
Starts against a **mock JSON fixture** at H+2 so they never wait on the backend.

### Shared, non-negotiable
- **H+2 contract freeze:** Dev A publishes the exact `gemmaOutput` JSON; Dev B publishes the exact API routes; Dev C builds fixtures from them.
- **Integration checkpoints at H+10, H+20, H+30.** Everyone merges to `main` and the whole thing must run. A track that skips a checkpoint gets its scope cut.
- Small commits. The commit history is visible to judges and is itself evidence the work is real.

---

## 7. Hour-by-hour (relative to start)

### DAY 1

**H+0 → H+1 · All three: setup + the spike**
- **A:** `ollama pull gemma4:e4b`; prove text→JSON and image input work.
- **B:** Repo, `.gitignore` (**`secrets.env` and `.env` first**), Atlas M0 cluster, Express+Vite boot.
- **C:** ⚡ **THE AUDIO SPIKE (45 min, hard timebox).** Test audio via AI Studio `gemma-4-e4b-it` with `Part.from_bytes(mime_type="audio/wav")`, and via Ollama `/v1/chat/completions` with `input_audio`. Five Bangla clips, 15s each. Record latency and fidelity. **Report at H+2.** Do not exceed the timebox — a negative result on time is worth more than a positive result late.

**H+2 · CONTRACT FREEZE + AUDIO GO/NO-GO.** 20 minutes, all three. Decide audio by the §1 rule. Publish the JSON contract and the route list. From here the tracks run independently.

**H+2 → H+8**
- **A:** Provider adapter with retry/timeout/JSON-repair + `gemma_calls` logging. Triage (Stage 2) and Evidence (Stage 3) prompts. Test against 15 deliberately hostile inputs: pure Bangla, Banglish code-switching, phonetic Bangla in Latin script, run-on sentences, an ambiguous photo. **Do not proceed until malformed output lands in `manual_review` instead of a 500.**
- **B:** Mongoose models + 2dsphere indexes, `POST /api/reports`, `GET /api/issues` (GeoJSON), SSE channel. **Deploy hello-world to production by H+3.**
- **C:** Citizen PWA against fixtures — Bangla-first mobile UI, camera capture, geolocation, submit, confirmation screen.

**H+8 → H+14**
- **A:** Dedupe (Stage 4) + dispatch brief (Stage 5). Merge-reason strings surfaced for the UI.
- **B:** Wire the real pipeline into the route. Write the **seed corpus**: ~120 realistic Bangla/Banglish complaints across Gazipur wards, deliberately containing **clusters** (12 about one transformer, 8 about one flooded road) so dedupe and the heatmap have something real to show.
- **C:** Councilor dashboard shell + Mapbox: severity pins, heatmap weighted by `priorityWeight × reportCount`, issue drawer.

**H+14 → H+16 · Integration checkpoint 1 + seed run**
Merge. Run the full seed through the **real** pipeline (budget the runtime — E4B on CPU is not fast). First screenshot of a populated map.

*Sleep in shifts. A 3am build is where demos break.*

### DAY 2

**H+16 → H+24**
- **A:** Copilot (Stage 6) — tool schema, parameter validation, Bangla narration. Then the **evaluation harness** (§8).
- **B:** Production deploy of the real stack, seeded prod database, `/transparency` endpoint, README, Kaggle notebook.
- **C:** Copilot UI + live map re-render, transparency page, work queue, SLA countdowns, loading/empty/error states.

**H+24 → H+28 · Integration checkpoint 2 · FEATURE FREEZE at H+28**
Everything that isn't working at H+28 is cut. No exceptions. Polish only from here.

**H+28 → H+31 · Deploy verification + eval numbers**
Public URL tested in a **private browsing window**. Benchmark table generated from real `gemma_calls` data.

**H+31 → H+36 · The video (C leads, A narrates)** — §9.

**H+36 → H+42 · The writeup (A leads, B+C review)** — §10.

**H+42 → H+45 · README, notebook, license audit, rule-compliance grep**

**H+45 → H+46 · SUBMIT.** Click **Submit**, not Save. Then the Google Form.

**H+46 → deadline · Buffer.** Resubmission is unlimited. Missing the deadline is fatal.

---

## 8. The evaluation harness — the differentiator nobody else will have

Two hours of Dev A's time on day 2, and it is worth more than any additional feature.

Hand-label **60 seed reports** (category + severity + which ones are true duplicates). Then measure and publish:

| Metric | What it shows |
|---|---|
| Category accuracy | Triage reliability |
| Severity — exact match & within ±1 | Honest calibration |
| Dedupe precision / recall | Does the merge actually work |
| Evidence-check agreement with human | Is verification meaningful |
| p50 / p95 latency per stage | Real performance, from `gemma_calls` |
| JSON parse success rate | Engineering rigour |

Publish the numbers **including the bad ones**. Every experienced judge trusts a project more when it names its own weaknesses, and no other team in a 48-hour sprint will bring measured results. This single table lifts Technical Implementation *and* Presentation.

---

## 9. The video (≤3:00)

Judges watch these back to back. The first 15 seconds decide the score.

| Time | Shot |
|---|---|
| 0:00–0:12 | **Problem, cold.** A Gazipur street, a broken thing. One sentence: hundreds of complaints a day, no way to sort them. |
| 0:12–0:25 | The pitch (§2) over a dashboard already full of pins. |
| 0:25–0:55 | **Live citizen submission** on a phone — Bangla text (or voice, if it shipped) + photo. Cut to the confirmation showing Gemma's structured understanding. |
| 0:55–1:15 | **Cut to the dashboard — the pin drops live via SSE. Same unbroken take.** This is the proof-of-realness shot. |
| 1:15–1:40 | **Dedupe reveal.** "Forty citizens reported this. One ticket." Show count + merged evidence photos. |
| 1:40–2:05 | **The Copilot.** Ask in Bangla, watch the map rearrange. |
| 2:05–2:25 | **Offline proof.** Wifi off on camera. Submit again. Still works. Zero cost per report. |
| 2:25–2:45 | The benchmark table from the README (no in-app Transparency page anymore). "Nothing here is faked." |
| 2:45–3:00 | Impact line, repo + demo URLs on screen. |

No slides. No talking-head intro. No logo animation. Product on screen from second one.

---

## 10. Writeup — 1,500-word budget

The rules name the required sections. Follow them exactly:

| Section | Words |
|---|---|
| Title, subtitle, one-sentence pitch | 40 |
| Problem + why it matters (Gazipur specifics, the triage bottleneck) | 250 |
| The solution — what it does, for whom | 180 |
| **How Gemma 4 is integrated** — five stages, modalities, why E4B | **400** |
| System architecture + diagram | 180 |
| Technical challenges: JSON reliability on code-switched Bangla · tool-schema whitelisting vs. injection · dedupe precision/recall tradeoff · audio transport findings · CPU latency | 250 |
| **Results table** (§8) | 100 |
| Limitations, honestly | 60 |
| Future work + impact | 40 |

---

## 11. Risk register

| Risk | Likelihood | Pre-made decision |
|---|---|---|
| Audio unusable | **High** | Spiked at H+0 by someone off the critical path; cut at H+2 by a written rule. Zero architectural impact. |
| E4B too slow on CPU for live demo | Medium | Pre-seed everything; the live demo submits *one* report. Hosted provider for the demo transport. Never make a judge wait 40 seconds. |
| Malformed JSON | Medium | Schema validate → repair prompt → `manual_review`. Never a 500. |
| Dedupe false merges | Medium | Require geospatial proximity **and** model agreement; 150 m cap; show merge reasons in the UI so errors are visible and honest. |
| Deployment eats day 2 | **High** | Dev B deploys hello-world at **H+3**. |
| Integration hell at the end | **High** | Contract freeze H+2; checkpoints H+10/H+20/H+30. |
| Mapbox token/quota | Low | MapLibre + free tiles is a drop-in fallback. |
| Writeup/video rushed | **High** | Hard feature freeze at H+28. Cut features, never cut the writeup. |
| **Kaggle token leaked in public repo** | **High** | `secrets.env` gitignored at commit #1; rotate the token after the hackathon. |

---

## 12. Explicitly NOT building

Real authentication · user profiles · actual SMS delivery (we *generate* the message, we don't send it) · admin CRUD · RBAC · offline sync queue · native mobile app · fine-tuning · RAG over municipal PDFs · multi-city support · analytics beyond the copilot · a test suite · CI/CD · dark mode.

Each is defensible. None is worth a rubric point in 48 hours.

---

## 13. Submission checklist

- [ ] Public GitHub repo — README with install, usage, architecture, dataset licenses
- [ ] Public demo URL **verified in a private window** (no auth, no paywall)
- [ ] Runnable Kaggle notebook demonstrating the pipeline
- [ ] Demo video ≤ 3:00, publicly viewable
- [ ] Writeup ≤ 1,500 words, all required sections, repo + demo attached under Attachments → Project Links
- [ ] **Clicked Submit** (not Save) — verify it shows as submitted
- [ ] Google Form completed afterwards
- [ ] Rule-compliance grep clean (CLAUDE.md §1)
- [ ] `secrets.env` / `.env` not in git history
- [ ] Every dataset license named in the README

---

## 14. What changed from `Initial_idea.md`, and why

| Original | Now | Reason |
|---|---|---|
| 12-day, 3-sprint plan | 48-hour, 3-track parallel plan | Real deadline is ~2026-07-26. |
| Gemma as a text→JSON parser | Five cognitive roles, multimodal | Gemma Integration is 30 pts and asks "is the model **core**?" One extraction call reads as "LLM as a parser." |
| Separate Python/FastAPI service | Node → Ollama directly | Second runtime = second failure mode, zero extra points. |
| English-first | **Bangla-first** | The judges, the users, and the entire impact story are Bangladeshi. |
| Text only | **+ photo evidence verification** | Strongest innovation claim; needs a multimodal model to be possible at all. |
| One report = one pin | **Semantic dedupe into Issues** | The actual civic problem, and it turns Gemma from extractor into reasoner. |
| Static heatmap | **Tool-calling Bangla copilot** | The demo moment and hard proof of agentic use. |
| "Estimated budget impact" sidebar | Dispatch briefs, SLA timers, priority weight | Invented taka figures are unverifiable hype that costs credibility with technical judges. Operational artifacts are checkable. |
| — | **Transparency page + audit log** | Answers "is this real or faked for the demo?" |
| — | **Evaluation harness with published metrics** | Nobody else in a 48-hour sprint will bring measured results. |
| — | Offline/sovereign framing | Free, private, runs on hardware a city owns — the story no closed-API project can tell. |
