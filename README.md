# AI Agents Live Board

GitHub Pages frontend for the live AI Sales Agent dashboard.

## What This Repo Hosts

- GitHub Pages frontend at `https://emadameri.github.io/ai-agents/`
- A live board that connects to your running backend over `/api/live-dashboard`
- A node-and-connection view for Brain 1 through Finalize
- Accordion-based lead lists when a section has more than 5 items

## Architecture

- Frontend: GitHub Pages
- Backend: your local machine running `ai-sales-agent`
- Live API: `https://your-public-backend.example.com/api/live-dashboard`

## Important

GitHub Pages cannot run Python, so the backend must stay on your machine or another server you control.
To make the hosted page truly live, expose the backend with a public URL and enter that URL in the page.

Example backend URL:

- `https://your-public-url.example.com`

Expected live endpoint:

- `https://your-public-url.example.com/api/live-dashboard`

## Local Backend

The backend code lives in `/home/agmentic/ai-sales-agent` and provides:

- `/api/dashboard`
- `/api/live-dashboard`

The live payload now includes:

- `summary`
- `projects`
- `selected_project`
- `next_work`
- `brain_states`
- `collected_leads`
- `top_scored_leads`
- `queued_for_enrich_leads`
- `completed_leads`
- `pending_approvals`
- `pending_message_approvals`
- `recent_activity`
- `stages`

## UX Notes

- Lists with more than 5 leads collapse into an accordion to keep the board readable.
- The brain graph animates the handoff path between nodes to make agent behavior easier to follow.
- The page lets you switch project, set refresh interval, and point the frontend at any public backend URL.
