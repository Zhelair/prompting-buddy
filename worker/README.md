# Prompting Buddy — House Proxy (Cloudflare Worker)

This backend keeps **your DeepSeek API key** and **Buddy logic** private.

## What it does
- Passphrase unlock -> signed token
- Premium endpoints require token
- Daily limits enforced server-side (reset at **00:00 Europe/Sofia**)
  - Prompt Check: 30/day
  - Coach last 5: 5/day
- Per-request caps enforced
  - Prompt Check: 5,000 chars
  - Coach: 8,000 chars (combined)

## Deploy
1) Install Wrangler + login
```bash
npm i -g wrangler
wrangler login
```

2) From this folder:
```bash
wrangler deploy
```

3) Set secrets (required)
```bash
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put ALLOWED_PASSPHRASES
wrangler secret put TOKEN_SECRET
```
- `ALLOWED_PASSPHRASES`: comma-separated values (example):
  - `ODDLY-USEFUL-2026`
- `TOKEN_SECRET`: any long random string (32+ chars)

Optional:
```bash
wrangler secret put ALLOWED_ORIGINS
```
Example value:
- `https://zhelair.github.io,https://zhelair.github.io/prompting-buddy`

## Connect the frontend
After deploy, copy your Worker URL and set it in:
- `assets/data.js` -> `house.endpoint`

