# AI Agents Live Board

GitHub Pages frontend for a live AI Sales Agent dashboard.

## Architecture

- Frontend: GitHub Pages
- Backend: your local computer running `ai-sales-agent`
- Live API endpoint: `/api/live-dashboard`

## Important

GitHub Pages cannot run Python. The backend must stay on your machine.
To make the GitHub-hosted page show live data, expose your local dashboard API with a public URL and put that URL into the page.

Example backend URL:

- `https://your-public-url.example.com`

Expected API:

- `https://your-public-url.example.com/api/live-dashboard`

## Frontend URL

- `https://emadameri.github.io/ai-agents/`

## Local backend

The local backend lives in `/home/agmentic/ai-sales-agent` and now provides:

- `/api/dashboard`
- `/api/live-dashboard`

The live endpoint includes:

- collected lead counts
- Brain 1 to Brain 5 status
- next queued action
- top scored leads
- enriched leads
- final leads
- recent source runs
- recent activity feed
