# Vizag International School — Frontend (React + Vite)

Two responsive dashboards:

- **Admin** (`/admin`) — school-admin panel styled like the reference mock:
  fee collection bar chart, enrolment donut, performance bubbles, top classes,
  admissions line chart, KPI row.
- **Student** (`/student`) — sample data for a demo student: attendance / GPA /
  rank stats, subject-performance bar chart, attendance trend line chart,
  study-time donut, skill index, upcoming exams, assignments and timetable.

Both layouts collapse cleanly from desktop down to mobile (sidebar becomes a
slide-in drawer, grids reflow to a single column, charts scale with their
container).

## Setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

Make sure the backend is running on port 8000 (`uvicorn app.main:app --reload`
from the `backend` folder). The Vite dev server proxies `/api` to it. If the
backend is down the dashboards fall back to bundled demo data so the UI still
renders.

## Build

```bash
npm run build
npm run preview
```

## Deploy (Vercel)

1. Push this repo to GitHub, then in Vercel: **Add New → Project**, pick the repo.
2. **Root Directory:** `frontend` (Vercel auto-detects the Vite framework preset).
3. **Environment Variable:**
   ```
   VITE_API_BASE=https://<your-render-service>.onrender.com
   ```
   Without this the app calls relative `/api/...` paths, which only work
   because of the *local* dev proxy in `vite.config.js` — on Vercel there's no
   backend to proxy to, so every API call needs the full Render URL here.
4. `vercel.json` (already in this folder) rewrites every path to
   `index.html` — required because this is a client-side-routed SPA
   (`/admin/...`, `/student/a/:id`, …); without it, opening one of those URLs
   directly (e.g. a test link shared over WhatsApp) 404s.
5. Deploy. Vercel gives both a stable production URL and a per-PR preview
   URL — the backend's CORS already allows any `*.vercel.app` origin, so
   previews work without extra config.
6. Set the backend's `FRONTEND_URL` env var (on Render) to this project's
   production URL — that's what gets baked into the `/student/a/{id}` links
   on the admin Tests & Links page and its Excel export.
