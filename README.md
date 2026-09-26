# Vizag International School — Dashboards + Academics

```
vizag_internation_school/
├── backend/     FastAPI — mock dashboard data + Academics CRUD (Supabase)
└── frontend/    React + Vite — Admin & Student dashboards + Academics manager
```

## What's implemented vs. under construction

| Area | State |
|------|-------|
| **Admin dashboard** (`/admin`) | **Real overview** — live totals, 30-day attempts graph, per-class stats, recent results |
| **Examinations** (`/admin/examinations`) | **Working, real feature** — all student results, filter by class/assignment, expand per-question, export to Excel |
| **Tests & Links** (`/admin/tests`) | **Working, real feature** — every test's class/subject/chapter/name + a direct student-portal link, filter by class, export to Excel |
| **WhatsApp test bot** | **Working, real feature** — students take a test from any phone via the school's WhatsApp number; results sent to the parent's number; can be switched off from Settings |
| **Student portal** (`/student`) | **Working, real feature** — sign in with student ID, take class assignments, graded results |
| **Classes & Sections** (`/admin/academics`) | **Working, real feature** — persisted to Supabase |
| **Students** (`/admin/students`) | **Working, real feature** — add students (ID, class, section, parent contact); bulk import from Excel/Word |
| **Settings** (`/admin/settings`) | **Working, real feature** — app-wide feature switches |
| Every other sidebar item (Teachers, Fees, Exams, Messages, …) | "Under construction" placeholder page |

### Academics manager

Admin builds the academic structure:

```
Class ──< Sections                         (Grade IX → A, B)
      └─< Subjects ──< Topics ──< Assignments ──< Questions (MCQ)
```

- Add / delete at every level; deleting anything cascades to its children.
- Open an assignment (`Manage questions →`) to:
  - set **Attempts allowed for students** (the limit the student portal enforces).
  - **add questions one by one** — question text, 2–8 options, mark the correct
    one, set marks; edit or delete any question afterwards.
  - **bulk import** — upload a **.docx** or **.xlsx** file and every question in
    it is parsed and added automatically (result shows added / skipped / notes).
    Sample files: `backend/sample_uploads/`.
- Data is stored in **Supabase** (or an in-memory fallback if no DB is
  configured — a badge on the page shows which).

### Student portal (`/student`)

- **Sign in** with a student ID (e.g. `VIS-0001`) — remembered in the browser;
  "Sign out" clears it.
- Dashboard: stat cards (assignments / completed / pending / average score), a
  best-vs-latest score bar chart, and a table of **every assignment set for the
  student's class**.
- **Start** an assignment → answer the MCQs → **Submit**. Graded server-side; the
  student sees the percentage, marks, and each question with their answer and the
  **correct answer** revealed. Re-attempts allowed up to the admin's limit, then
  the button becomes "View result".

### Students

`/admin/students` — add a student (student ID, name, class, section,
parent/guardian name, parent/guardian phone). Section options depend on the
chosen class. Or **bulk import** an `.xlsx` / `.docx` list — class/section names
in the file are created automatically, duplicate student IDs are skipped with a
note. The list has a class filter + ID/name/parent search. Same
Supabase-or-memory storage; `class_id` / `section_id` come from the Academics
tree.

### Settings

`/admin/settings` —

- **Feature switches** that turn features on/off across the whole app (stored
  server-side, applies to everyone): Classes & Sections, Students, Assignments &
  Questions, Bulk import, Student portal, Dashboard activity feed. When a feature
  is off its sidebar entry disappears and its routes show a "turned off" panel.
- **Promote a class (year-end)** — pick a *from* class and a *to* class (the next
  class is auto-suggested) and press **Promote all students**. Every student in
  the from-class moves to the to-class; sections are re-matched by name where the
  target class has them, otherwise cleared. Asks for confirmation with the count.

## 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt

# optional but recommended — enables real persistence:
#   1. run backend/sql/schema.sql in the Supabase SQL editor
#   2. cp .env.example .env  and fill SUPABASE_URL + SUPABASE_SERVICE_KEY

python -m uvicorn app.main:app --reload --port 8000
```

On a managed Windows machine, running the bare `uvicorn` command can get blocked by Device
Guard / App Control (it blocks the auto-generated `.venv\Scripts\uvicorn.exe` launcher).
`python -m uvicorn ...` runs the same thing through `python.exe` instead, which isn't blocked.

See [backend/README.md](backend/README.md) for the full endpoint list.

## 2. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Vite proxies `/api` to the backend on port 8000. Dashboards fall back to bundled
demo data if the backend is down; the Academics page needs the backend running.

Switch between Admin and Student from the toggle at the bottom of the sidebar.

## Deployment

Backend → **Render**, frontend → **Vercel**. Full step-by-step in
[backend/README.md](backend/README.md#deploy-render) and
[frontend/README.md](frontend/README.md#deploy-vercel). Short version: set
`VITE_API_BASE` on Vercel to the Render URL, and `FRONTEND_URL` on Render to
the Vercel URL — each side needs to know the other's address. Once the
backend has a stable Render URL, point the Meta WhatsApp webhook at it
instead of the local ngrok tunnel used during development.

## Responsiveness

12-column CSS grid with breakpoints at 1200 / 1000 / 720px. Under 1000px the
sidebar becomes a hamburger drawer. All charts are inline SVG with `viewBox`
scaling, so they resize with their card on any device.
