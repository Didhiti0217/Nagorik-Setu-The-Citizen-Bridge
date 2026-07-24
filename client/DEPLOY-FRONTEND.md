# Deploying the frontend

The frontend is a static Vite build. Both configs are in place (`vercel.json`,
`netlify.toml`) so this is a 5-minute, one-import job — **once the API CORS fix is live**.

## ⚠️ Prerequisite: the API must send CORS headers first

The frontend calls the API cross-origin in production. Until the API redeploys with the
CORS fix (commit `344aca9`), the deployed dashboard will load but show **no data** — the
browser blocks every request.

Check before deploying the frontend:

```bash
curl -i -H "Origin: https://example.com" https://nagorik-setu-api.onrender.com/api/health | grep -i access-control-allow-origin
```

If that prints `access-control-allow-origin: *`, you are clear. If it prints nothing, the
API still needs a redeploy on Render (Manual Deploy → Deploy latest commit).

## Vercel (recommended)

1. vercel.com → Add New → Project → import `Didhiti0217/Gemma---AI---Hackathon-`
2. **Root Directory: `client`** (important — this is a monorepo)
3. Framework preset: Vite (auto-detected)
4. Environment Variables → add:
   `VITE_API_BASE = https://nagorik-setu-api.onrender.com`
5. Deploy.

## Netlify (alternative)

1. Add new site → import the repo
2. Base directory: `client` (picked up from `netlify.toml`)
3. Environment → `VITE_API_BASE = https://nagorik-setu-api.onrender.com`
4. Deploy.

## After deploying — REQUIRED before submission

- Open the deployed URL in a **private/incognito window**. It must work with no login.
  This is an explicit competition rule; a demo behind auth is disqualified.
- Visit `/dashboard` — the map should show 17 issues and the queue should populate.
- Hard-refresh on `/dashboard` — it must NOT 404 (the SPA rewrite handles this).
- Optionally, lock the API's `CLIENT_ORIGIN` env var on Render down from `*` to your
  actual Vercel URL, then redeploy the API once more. Not required for judging.

## Local build sanity check

```bash
cd client
npm install
npm run build      # must succeed; outputs dist/
npm run preview    # serves the production build on http://localhost:4173
```
