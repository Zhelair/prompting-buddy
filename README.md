# Prompting Buddy

Standalone Prompting Buddy app (UI + Cloudflare Worker backend).

## 1) Frontend (GitHub Pages)
- Files live in the repo root + `assets/`
- Enable GitHub Pages for the repo (Settings -> Pages -> Deploy from Branch -> `main` -> `/root`)

## 2) Backend (Cloudflare Worker)
- The Worker code is in `worker/`
- Deploy it with Wrangler (see `worker/README.md`)

## 3) Connect frontend to backend
Edit `assets/data.js`:
- Set `house.endpoint` to your Worker URL

## Notes
- Premium unlock uses a passphrase -> server issues a token.
- Your DeepSeek key + Buddy system prompts live only in the Worker.
- Daily counters reset at 00:00 Europe/Sofia.
