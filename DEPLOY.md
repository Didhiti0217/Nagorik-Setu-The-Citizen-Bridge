# Deploying the Nagorik Setu API

The backend is a single always-on Node service. It needs two things you create
once: a **MongoDB Atlas** database and a **Render** web service. Both have free
tiers that are enough for judging.

> **Why Render, not Vercel:** the API keeps long-lived SSE connections open and
> keeps processing a report *after* it has replied `202`. Serverless functions
> kill both. A normal always-on service is the correct fit.

---

## 0. Prerequisites

- The repo is pushed to GitHub (already: `Didhiti0217/Gemma---AI---Hackathon-`).
- Your Gemma key from `secrets.env` (the `IshraqGemma` value) — you will paste
  it into Render's dashboard, never into a file.

---

## 1. MongoDB Atlas (the database)

1. Create a free account at <https://www.mongodb.com/cloud/atlas/register>.
2. Create a **free M0 cluster** (any region near Bangladesh, e.g. Mumbai).
3. **Database Access →** add a database user (username + password). Save both.
4. **Network Access →** add IP `0.0.0.0/0` (allow from anywhere — Render's IPs
   are dynamic on the free tier). Fine for a hackathon; tighten later.
5. **Connect → Drivers →** copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<user>` and `<password>`, and add the database name before the `?`:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/nagorik-setu?retryWrites=true&w=majority
   ```
   This whole string is your `MONGODB_URI`.

---

## 2. Render (the server)

The repo ships a [`render.yaml`](render.yaml) blueprint, so this is mostly clicks.

1. Create a free account at <https://render.com> and connect your GitHub.
2. **New + → Blueprint**, pick the `Gemma---AI---Hackathon-` repo. Render reads
   `render.yaml` and proposes the `nagorik-setu-api` service.
3. When prompted for the two secret env vars, paste:
   - `GOOGLE_API_KEY` = your Gemma key (from `secrets.env`)
   - `MONGODB_URI` = the Atlas string from step 1
4. Click **Apply / Create**. First deploy takes a few minutes.

The non-secret vars (`GEMMA_PROVIDER=aistudio`, `GEMMA_MODEL=gemma-4-26b-a4b-it`,
`CLIENT_ORIGIN=*`) are already set by the blueprint.

> If you'd rather not use a blueprint: **New + → Web Service**, root directory
> `server`, build `npm install`, start `npm start`, health check `/api/health`,
> then add all four env vars by hand.

---

## 3. Verify (do this before telling anyone the URL)

Render gives you a URL like `https://nagorik-setu-api.onrender.com`. Check it in
a **private browsing window** (the rules require the demo to work with no login):

```bash
curl https://nagorik-setu-api.onrender.com/api/health
```

Expect `{"ok":true,...,"db":"connected","gemma":{"provider":"aistudio",...}}`.

Then submit one real report end to end (this makes a real ~20s Gemma call):

```bash
curl -X POST https://nagorik-setu-api.onrender.com/api/reports \
  -H "Content-Type: application/json" \
  -d '{"rawText":"টঙ্গী বাজারে বিদ্যুতের তার ছিঁড়ে স্পার্ক করছে","lng":90.4012,"lat":23.8918}'
```

Expect `202` immediately. A few seconds later:

```bash
curl https://nagorik-setu-api.onrender.com/api/issues
```

should show one triaged issue, and `/api/transparency` should show the real
Gemma call with its latency.

---

## 4. Endpoints the frontend (Dev C) will use

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/reports` | citizen submit (JSON or multipart w/ `photo`); returns `202 {id}` |
| GET | `/api/reports/:id` | poll triage status |
| GET | `/api/issues` | ranked work queue |
| GET | `/api/issues?format=geojson` | map layer (FeatureCollection) |
| GET | `/api/issues/:id` | issue detail + merge history |
| GET | `/api/stream` | SSE: `issue:created`, `issue:updated`, `report:failed` |
| POST | `/api/copilot` | `{question}` → Bangla answer + tool results |
| GET | `/api/transparency` | last 100 Gemma calls + p50/p95 |
| GET | `/api/health` | liveness + provider + db state |

---

## Local development

```bash
cd server
cp .env.example .env      # then paste your Gemma key into GOOGLE_API_KEY
npm install
npm run dev               # needs a local mongod on 127.0.0.1:27017, or set MONGODB_URI
```

No database or key handy? Prove the whole backend works offline in one command —
it uses an in-memory Mongo and mock Gemma:

```bash
npm run api:smoke
```
