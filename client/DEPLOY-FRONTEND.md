# Deploying the frontend

The frontend is a static Vite build. Both configs are in place (`vercel.json`,
`netlify.toml`) so this is a 5-minute, one-import job.

## Live API

The backend is deployed and verified at:

```
https://nagorik-setu-api-ciee.onrender.com
```

CORS is working (`access-control-allow-origin: *`), the database is connected, and
`/api/issues` serves 17 seeded issues. You can confirm any time:

```bash
curl -i -H "Origin: https://example.com" https://nagorik-setu-api-ciee.onrender.com/api/health | grep -i access-control-allow-origin
```

If that prints `access-control-allow-origin: *`, the frontend will work against it.

## Vercel (recommended)

1. vercel.com -> Add New -> Project -> import `Didhiti0217/Gemma---AI---Hackathon-`
2. **Root Directory: `client`** (important - this is a monorepo)
3. Framework preset: Vite (auto-detected)
4. Environment Variables -> add:
   `VITE_API_BASE = https://nagorik-setu-api-ciee.onrender.com`
5. Deploy.

## Netlify (alternative)

1. Add new site -> import the repo
2. Base directory: `client` (picked up from `netlify.toml`)
3. Environment -> `VITE_API_BASE = https://nagorik-setu-api-ciee.onrender.com`
4. Deploy.

## After deploying - REQUIRED before submission

- Open the deployed URL in a **private/incognito window**. It must work with no login.
  This is an explicit competition rule; a demo behind auth is disqualified.
- Visit `/dashboard` - the map should show 17 issues and the queue should populate.
- Hard-refresh on `/dashboard` - it must NOT 404 (the SPA rewrite handles this).
- Optionally, lock the API's `CLIENT_ORIGIN` env var on Render down from `*` to your
  actual Vercel URL, then redeploy the API once more. Not required for judging.

## Local build sanity check

```bash
cd client
npm install
npm run build      # must succeed; outputs dist/
npm run preview    # serves the production build on http://localhost:4173
```
