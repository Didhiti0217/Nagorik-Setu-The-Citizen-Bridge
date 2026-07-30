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
3. When prompted for the secret env vars, paste:
   - `GOOGLE_API_KEY` = your Gemma key (from `secrets.env`)
   - `MONGODB_URI` = the Atlas string from step 1
   - `JWT_SECRET` = `openssl rand -base64 48`. **The server refuses to boot** if this
     is missing or shorter than 32 characters — a weak HS256 secret is a forgeable
     session, and the symptom is nothing at all until someone forges one.
   - `ADMIN_SEED_PASSWORD` = the console password you are willing to publish in the
     README (currently `nagorik-demo-2026`). Leave it unset and `seed:admins`
     generates one and prints it once.
4. Click **Apply / Create**. First deploy takes a few minutes.

The non-secret vars — provider, model, `CLIENT_ORIGIN`, `PUBLIC_APP_URL`, the OTP knobs
and `ADMIN_SEED` — are already set by the blueprint. Two are worth understanding before
you change them:

- `AUTH_DEMO_MODE=true` returns the login code in the API response so a judge can sign in
  without a Bangladeshi SIM. It is only safe while `OTP_SENDER=demo`, and the server
  enforces that pairing at boot rather than warning about it.
- `PUBLIC_APP_URL` must be a real origin (it builds admin invite links), which is why it
  is separate from `CLIENT_ORIGIN` — that one may be a `*` wildcard.

### 2b. Create the console account

Nothing can sign into the councilor console until an account exists — admin accounts are
never self-registered. From a local checkout pointed at the **same** Atlas database:

```bash
cd server
MONGODB_URI="<your atlas string>" npm run seed:admins
```

It prints one line per account and is idempotent (existing accounts keep their passwords
unless you pass `--reset-password`). Residents need no provisioning — the first correct
one-time code creates the account.

> If you'd rather not use a blueprint: **New + → Web Service**, root directory
> `server`, build `npm install`, start `npm start`, health check `/api/health`,
> then add every env var from `render.yaml` by hand.

---

## 3. Verify (do this before telling anyone the URL)

Render gives you a URL like `https://nagorik-setu-api.onrender.com`. Start with the two
endpoints that are public on purpose — a judge must be able to inspect real Gemma calls
without an account:

```bash
curl https://nagorik-setu-api.onrender.com/api/health
curl https://nagorik-setu-api.onrender.com/api/transparency
```

Expect `{"ok":true,...,"db":"connected","gemma":{"provider":"aistudio",...}}`.

Everything else is closed, so verifying intake means signing in first. Demo mode hands
you the code back, so the whole round trip is two calls:

```bash
API=https://nagorik-setu-api.onrender.com
curl -sX POST $API/api/auth/otp/request -H 'Content-Type: application/json' \
  -d '{"phone":"01712345678"}'
# -> {"masked":"+8801•••••678","demoCode":"123456",...}

TOKEN=$(curl -sX POST $API/api/auth/otp/verify -H 'Content-Type: application/json' \
  -d '{"phone":"01712345678","code":"123456"}' | jq -r .token)
```

Then submit one real report end to end (this makes a real ~20s Gemma call):

```bash
curl -X POST $API/api/reports -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rawText":"টঙ্গী বাজারে বিদ্যুতের তার ছিঁড়ে স্পার্ক করছে","lng":90.4012,"lat":23.8918}'
```

Expect `202` immediately, and `GET /api/reports/mine` with the same token to list it. A
few seconds later, with an **admin** token from `POST /api/auth/admin/login`:

```bash
curl $API/api/issues -H "Authorization: Bearer $ADMIN_TOKEN"
```

should show one triaged issue, and `/api/transparency` should show the real
Gemma call with its latency.

Finally, open the deployed frontend in a **private browsing window** and complete both
sign-ins from the README's demo table. The rules require the demo to be reachable with no
account of your own and no paywall; a published demo credential satisfies that, an
unpublished one does not.

---

## 4. Endpoints the frontend uses

"Who" is enforced on every row by [`server/src/middleware/auth.js`](server/src/middleware/auth.js);
`npm run api:smoke` fails if any guard here goes missing.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/otp/request` | public | `{phone}` → masked number (+ `demoCode` in demo mode) |
| POST | `/api/auth/otp/verify` | public | `{phone, code}` → `{token, user}`; first success creates the resident |
| POST | `/api/auth/admin/login` | public | `{email, password}` → `{token, user}` |
| GET | `/api/auth/me` | signed in | identity for a token |
| POST | `/api/auth/stream-ticket` | admin | short-lived ticket for `EventSource` |
| POST | `/api/auth/admin/invites` | admin | invite an officer into **your** corporation |
| GET | `/api/auth/invites/:token` | public | preview an invitation (the recipient has no account yet) |
| POST | `/api/auth/invites/accept` | public | `{token, name, password}` → signed in as an admin |
| POST | `/api/reports` | resident | citizen submit (JSON or multipart w/ `photo`); returns `202 {id}` |
| GET | `/api/reports/mine` | resident | own reports + the issue each was folded into |
| GET | `/api/reports/:id` | owner or admin | poll triage status (404, not 403, if not yours) |
| GET | `/api/issues` | admin | ranked work queue |
| GET | `/api/issues?format=geojson` | admin | map layer (FeatureCollection) |
| GET | `/api/issues/:id` | admin | issue detail + merge history |
| GET | `/api/stream?ticket=…` | admin ticket | SSE: `issue:created`, `issue:updated`, `report:failed` |
| POST | `/api/copilot` | admin | `{question}` → Bangla answer + tool results |
| GET | `/api/transparency` | **public** | last 100 Gemma calls + p50/p95 |
| GET | `/api/health` | **public** | liveness + provider + db state |

---

## Local development

```bash
cd server
cp .env.example .env      # then paste your Gemma key into GOOGLE_API_KEY
npm install
npm run seed:admins       # one console account per ADMIN_SEED entry
npm run dev               # needs a local mongod on 127.0.0.1:27017, or set MONGODB_URI
```

`.env.example` ships a working local `JWT_SECRET` placeholder comment — generate a real
one with `openssl rand -base64 48` or the server will refuse to start, on purpose.

No database or key handy? Prove the whole backend works offline in one command —
it uses an in-memory Mongo and mock Gemma:

```bash
npm run api:smoke
```
