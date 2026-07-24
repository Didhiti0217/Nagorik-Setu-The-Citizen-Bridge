# Nagorik Setu — নাগরিক সেতু

### A single open Gemma 4 model that turns thousands of chaotic Bangla complaints into a ranked, de-duplicated, photo-verified work queue for a city corporation.

*Nagorik Setu ("The Citizen Bridge") reads a resident's Bangla voice-of-the-street complaint and a photo, and hands a ward councilor a short list of real, prioritized, non-duplicated problems — powered end to end by one open-weight model.*

---

## The problem, and why it matters

A city corporation in Bangladesh does not lack complaints. Gazipur — the country's largest city corporation by area, densely industrial, chronically under-resourced — receives them constantly, by phone, Facebook comment, and paper slip. The bottleneck is not **collection**. It is **triage**, and it fails in three specific ways:

1. **Duplication.** When a transformer starts sparking in Tongi Bazar, forty residents report it. That becomes forty tickets. No one can see it is one problem, so it is impossible to gauge how urgent or how widespread it really is.
2. **No prioritization.** A missing manhole cover a child could fall into and a broken streetlight arrive in the same undifferentiated pile.
3. **Unverifiable claims.** There is no cheap way to tell a real report from a mistaken or malicious one without dispatching a person.

The people worst served are exactly those with the least ability to navigate a bureaucratic form: residents with limited literacy, writing in Bangla, in English, or in "Banglish" — Bangla typed in Latin script. A complaint system that demands they select a category and a department is a system they will not use.

This matters because civic responsiveness is not a convenience; a sparking transformer or an open manhole is a threat to life, and the current triage gap means real hazards wait behind duplicates and noise.

## The solution

Nagorik Setu has two faces.

**For the citizen** — a one-screen mobile web app, Bangla by default. Type or describe the problem in any language, snap a photo, submit. There is no category dropdown, no severity slider, no department picker. A resident should not have to understand how a municipality is organized to report a broken thing. After submitting, they see *what the system understood* — a plain-language confirmation that their words were read correctly.

**For the ward councilor** — a live dashboard showing **issues, not reports**: the deduplicated physical problems, ranked by a priority weight that blends severity, how many citizens reported it, and whether it threatens life. A map moves from a priority heatmap when zoomed out to severity-colored pins when zoomed in. Each issue opens a Gemma-generated dispatch brief — crew, equipment, SLA, bilingual work order — and, crucially, the reason each duplicate was merged. A natural-language command bar lets the councilor ask questions in Bangla and watch the map answer.

## How Gemma 4 is integrated

Gemma 4 is not a feature bolted onto a CRUD app. It is the entire processing layer. Remove it and there is no product. One model — `gemma-4-26b-a4b-it`, a mixture-of-experts with only 3.8B active parameters — performs **five distinct cognitive roles**, and every inference call in the codebase flows through a single file (`server/src/gemma/client.js`), so the claim "Gemma is the only LLM here" is verifiable at a glance rather than asserted.

1. **Triage & structuring.** Free-text Bangla/Banglish/English becomes strict, schema-validated JSON: category, severity 1–5 *with a justification*, bilingual summaries, department routing, and a PII flag. Forcing the model to justify its severity score turns an opaque number into an auditable reason.

2. **Photo-evidence verification** *(vision)*. The model receives the photo **and** the claim and judges whether the image actually supports the complaint — first-pass triage of unverifiable reports that every civic system currently does by hand. Only a natively multimodal model makes this possible.

3. **Semantic deduplication** *(the core reasoning task)*. When a new report arrives, MongoDB narrows the field geospatially (150 m / 72 h) and Gemma decides the question a database cannot: *is this the same physical problem, or a different one that happens to be nearby?* This is what collapses forty complaints into one weighted ticket. It is reasoning, not extraction.

4. **Agentic dispatch brief** *(structured generation)*. For serious issues, Gemma writes the municipal work order and a citizen-facing Bangla notification.

5. **The Councilor's Copilot** *(tool calling)*. A Bangla question becomes one call against a whitelisted tool schema with typed, validated arguments — never a raw query string — which the backend executes and Gemma narrates back in Bangla.

Because Gemma 4 is open-weight (Apache 2.0), the whole system can run on hardware a municipality already owns: free, private, zero per-report cost, and citizen data that never leaves the building. Our provider adapter already supports a local Ollama backend; we demonstrate on the hosted API for speed.

## System architecture

A MERN stack with a single, isolated AI surface.

```
Citizen PWA ─┐                        ┌─ Councilor Dashboard
 (React,     │   REST + SSE (live)    │  (React + MapLibre GL)
  Bangla)    └───────────┬────────────┘
                         ▼
              Express API (Node 20)
              routes → services
                │              │
                ▼              ▼
        MongoDB Atlas    gemma/client.js  ── THE ONLY AI CALL ──
        reports          provider adapter → Gemma 4
        issues (2dsphere)                   (AI Studio, or local Ollama)
        gemma_calls (audit log)
```

Report submission is **asynchronous by necessity**: Gemma 4 reasons before answering and that reasoning is irreducible (see below), so the API returns `202` in ~100 ms and processes in the background. When triage finishes, a Server-Sent Event drops the new pin onto the dashboard live. Every model call is written to a `gemma_calls` audit log that powers an in-app Transparency page — the raw output of all 67 real calls, with genuine latencies.

## Technical challenges

**Gemma 4 reasons, and you cannot stop it.** The model returns its chain of thought as ordinary response parts flagged `thought: true`, *before* the answer. Naively concatenating parts yields the reasoning trace instead of the JSON — perfect output that looks like a parse failure. Thinking cannot be disabled (`thinkingConfig` returns HTTP 400) and consumes 75–80% of generated tokens, so a fixed token budget eventually starves the answer entirely. We filter thought parts and **escalate the budget on exhaustion** rather than repeat a doomed call. This is also why intake is async: ~20 s latency is a property of the model, not our code.

**Reliable JSON from code-switched Bangla.** Real complaints mix scripts mid-sentence. We combine few-shot prompting (which, measured, *reduces* reasoning tokens by giving the model a template), balanced-brace extraction, a one-shot repair pass, and a `manual_review` fallback so a malformed response degrades gracefully and never returns a 500.

**Injection safety in the Copilot.** The model never writes a query. It selects one tool from a fixed schema and fills typed parameters that are validated before touching the database, so a prompt-injected report body cannot reach the data layer. In evaluation, an explicit injection attempt was ignored and the real content triaged correctly.

**Deduplication is a precision/recall tradeoff with asymmetric costs.** A false merge silently buries a distinct complaint; a missed merge only costs an officer seconds. We deliberately bias toward *not* merging and surface every merge reason in the UI so an officer can catch a mistake.

## Results

Measured on labelled Gazipur reports via `gemma-4-26b-a4b-it`:

| Metric | Result |
|---|---|
| Triage category accuracy | 96.7% |
| Severity within ±1 | 100% |
| JSON schema-valid output | 100% (0 repairs, 0 fallbacks) |
| Deduplication precision / recall | 0.91 / 1.00 |
| By language (Bangla / Banglish / English) | 100% / 100% / 92.9% |
| Latency p50 / p95 | 20.0 s / 36.1 s |
| Prompt injection | resisted · PII flagged |

In the live seeded system, **38 citizen reports collapse to 17 issues** — the ten Tongi-transformer reports, written across three scripts, correctly merge into one.

Stage 3 was checked separately on **16 real-world civic photographs**. Given only the image, the model named the correct civic category on **16/16** (road collapse, exposed wiring, garbage, drainage failure, road blockade) and, when each photo was paired with an unrelated decoy complaint, rejected it on **16/16** — it does not rubber-stamp evidence.

## Limitations, honestly

We state these plainly rather than let a judge find them. The demonstration corpus is **synthetic** — hand-written to exercise cross-lingual deduplication; every AI-derived field is produced by the real pipeline, but no live citizen submitted these reports. Accuracy numbers reflect agreement with our own labels, written by the same team that wrote the prompts, so they are optimistic. Stage 3 was validated on real-world civic photographs but those images are third-party (used only to prove the capability, not as our own field data), and the seeded reports carry no photos, so evidence verification is not yet part of the end-to-end seeded numbers. And while the model is open-weight and the offline path is built, we benchmarked on the hosted API, not on municipal hardware.

## Future work and impact

The immediate next steps are real-photo evaluation, a pilot with live submissions, and locking the offline Ollama path to a single city-hall laptop — the deployment that makes the sovereignty argument real. The broader impact is a template: an open model, run locally at zero marginal cost, that lets an under-resourced municipality *see its own city clearly* — which problem is one problem, which is urgent, and which is real — without sending a single byte of citizen data to a third party.
