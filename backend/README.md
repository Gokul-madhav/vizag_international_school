# Vizag International School — Backend (FastAPI)

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
```

## Database (Supabase)

The **Academics** feature (classes / sections / subjects / topics) is persisted
in Supabase.

1. Create a project at https://supabase.com
2. In the SQL editor run [`sql/schema.sql`](sql/schema.sql)
3. Copy `.env.example` to `.env` and fill in from **Project Settings → API**:

   ```
   SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key
   ```

If `.env` is missing / blank, the API automatically falls back to an
**in-memory store** (seeded with sample data, reset on restart) so you can try
the feature without any setup. `GET /api/academics/status` reports which store
is active.

## Run

```bash
python -m uvicorn app.main:app --reload --port 8000
```

(Use `python -m uvicorn ...` rather than the bare `uvicorn` command — on a managed
Windows machine the latter invokes `.venv\Scripts\uvicorn.exe` directly, which
Device Guard / App Control policies often block. `python -m uvicorn` runs the
same server through `python.exe`, which isn't affected.)

API docs: http://localhost:8000/docs

## Deploy (Render)

1. Push this repo to GitHub, then in Render: **New → Web Service**, pick the repo.
2. **Root Directory:** `backend`
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. **Health Check Path:** `/api/health`
6. Add environment variables (Render → your service → Environment) — same
   names as `.env`:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   WHATSAPP_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_VERIFY_TOKEN=...
   WHATSAPP_RESULT_TEMPLATE=test_result
   WHATSAPP_TEMPLATE_LANG=en
   WHATSAPP_GRAPH_VERSION=v21.0
   WHATSAPP_APP_SECRET=...
   FRONTEND_URL=https://<your-vercel-app>.vercel.app
   ```
   (`FRONTEND_URL` is used to build the `/student/a/{id}` links shown in Admin
   → Tests & Links and its Excel export — set it to your real Vercel URL, not
   `localhost`.)
7. Once deployed you get a stable `https://<service>.onrender.com` URL —
   **no more ngrok**: update the Meta webhook Callback URL to
   `https://<service>.onrender.com/api/whatsapp/webhook` once, and it stays
   correct across every redeploy.
8. CORS already allows any `*.vercel.app` origin plus localhost by default
   (`app/main.py`). If you add a custom domain later, set
   `CORS_ORIGINS=https://your-domain.com` (comma-separated for more than one).

Render's free tier spins the service down after periods of inactivity — the
first request after an idle period can take 30–60s to wake it up. That's fine
for the admin panel, but keep it in mind for the WhatsApp webhook: Meta may
see a slow first response after idle time. A paid instance (or a periodic
health-check ping) avoids that.

## Endpoints

| Method | Path                               | Description                             |
|--------|------------------------------------|----------------------------------------|
| GET    | `/api/health`                      | Health check + active academics store  |
| GET    | `/api/admin/dashboard`             | School admin dashboard payload (mock)  |
| GET    | `/api/student/dashboard`           | Student dashboard payload (sample)     |
| GET    | `/api/academics/status`            | `{ "backend": "supabase" \| "memory" }` |
| GET    | `/api/academics/tree`              | Full nested classes → subjects → topics |
| POST   | `/api/academics/classes`           | `{ name }`                              |
| PATCH  | `/api/academics/classes/{id}`      | `{ name }` — rename                     |
| DELETE | `/api/academics/classes/{id}`      | Cascades to sections/subjects/topics    |
| POST   | `/api/academics/sections`          | `{ class_id, name }`                    |
| DELETE | `/api/academics/sections/{id}`     |                                        |
| POST   | `/api/academics/subjects`          | `{ class_id, name }`                    |
| PATCH  | `/api/academics/subjects/{id}`     | `{ name }` — rename                     |
| DELETE | `/api/academics/subjects/{id}`     | Cascades to topics                     |
| POST   | `/api/academics/topics`            | `{ subject_id, name, description? }`    |
| PATCH  | `/api/academics/topics/{id}`       | `{ subject_id, name, description? }`    |
| DELETE | `/api/academics/topics/{id}`       |                                        |
| POST   | `/api/academics/assignments`       | `{ topic_id, title, instructions? }`    |
| GET    | `/api/academics/assignments/{id}`  | Assignment + full questions list        |
| PATCH  | `/api/academics/assignments/{id}`  | `{ title, instructions? }`              |
| DELETE | `/api/academics/assignments/{id}`  | Cascades to questions                   |
| POST   | `/api/academics/questions`         | `{ assignment_id, text, options[], answer, marks }` |
| PATCH  | `/api/academics/questions/{id}`    | `{ text, options[], answer, marks }`    |
| DELETE | `/api/academics/questions/{id}`    |                                        |
| POST   | `/api/academics/assignments/{id}/questions/bulk` | multipart `file` = `.docx` / `.xlsx` |
| GET    | `/api/students`                    | `{ students[], backend }`               |
| POST   | `/api/students`                    | `{ student_id, name, class_id, section_id?, parent_name, parent_phone }` |
| PATCH  | `/api/students/{id}`               | same body                              |
| DELETE | `/api/students/{id}`               |                                        |
| POST   | `/api/students/bulk`              | multipart `file` = `.xlsx` / `.docx` student list |
| POST   | `/api/students/promote`          | `{ from_class_id, to_class_id }` — moves every student up a class |
| GET    | `/api/settings`                   | `{ flags, meta, backend }` — feature switches |
| PUT    | `/api/settings`                   | `{ flags: { <name>: bool } }` (merges)  |
| GET    | `/api/portal/login/{student_id}`  | Resolve a student ID → profile (student sign-in) |
| GET    | `/api/portal/dashboard?student_id=` | Student's class assignments + stats     |
| GET    | `/api/portal/assignments/{id}?student_id=` | Questions (no answers) + attempt info + last result |
| POST   | `/api/portal/assignments/{id}/attempt` | `{ student_id, answers: {question_id: option} }` → graded result |
| GET    | `/api/admin/overview`             | Dashboard numbers, 30-day attempt graph, per-class stats, recent results |
| GET    | `/api/exam/results?class_id=&assignment_id=` | Student attempt results, filterable |
| GET    | `/api/exam/attempts/{id}`         | One attempt graded, per-question detail |
| GET    | `/api/exam/export?class_id=&assignment_id=` | Filtered results as an `.xlsx` download |
| GET    | `/api/whatsapp/webhook`          | Meta webhook verification (echoes `hub.challenge`) |
| POST   | `/api/whatsapp/webhook`          | Inbound WhatsApp messages — runs the test bot |
| GET    | `/api/whatsapp/status`          | `{ configured, sessions_backend }` |

Students are stored in whichever backend academics uses (Supabase or in-memory).
`class_id` / `section_id` reference the academics tables; deleting a class
removes its students, deleting a section just unassigns them. `student_id` is a
school-assigned id, unique when present.

`POST /api/students/bulk` accepts a `.xlsx` or `.docx` list. Header columns
(any order, aliases accepted): `student_id`, `name`, `class`, `section`,
`parent_name`, `parent_phone`. Classes / sections named in the file are created
automatically if missing. Response:
`{ parsed, added, skipped, notes[], createdClasses[], createdSections[] }`.
Sample files in [`sample_uploads/`](sample_uploads/).

### Settings / feature switches

`GET/PUT /api/settings` stores app-wide feature flags (`academics`, `students`,
`assignments`, `bulk_import`, `student_portal`, `activity_feed`, `whatsapp_bot`)
— a single row `feature_flags` in the `app_settings` table on Supabase,
otherwise in memory. The admin Settings page reads and writes these; the
frontend hides gated features when a flag is off. `whatsapp_bot` is checked by
the webhook itself (`app/whatsapp.py`) on every inbound message — when off, the
bot replies that testing is temporarily unavailable instead of starting a test.

### Student portal (`/api/portal/*`)

Students sign in with their **student ID** (no password). The portal shows the
assignments set for the student's class, lets them attempt each one up to
`assignments.max_attempts` times (set by the admin), grades it, and returns the
result with the correct answers. Attempts are stored in the `attempts` table
(or memory). Attempt requests past the limit get `403`. The take/question
endpoint strips the `answer` field from questions; answers are only revealed in
graded results.

### WhatsApp test bot (`app/whatsapp.py`)

Students take a test **from any phone** by messaging the school's WhatsApp
Business number. Meta **WhatsApp Cloud API**; the webhook lives in this backend
and drives the same grading path as the web portal (`app/portal.py`).

Conversation (state stored in the `wa_sessions` table, keyed by the sender's
phone — **not** saved to the student record; the row is deleted when the test
ends and expires after 30 min idle):

```
student → "hi"                  bot → asks for the Student ID
student → "VIS-0001"            bot → interactive list of the class's pending tests
student → taps a test           bot → title + instructions + [Start] / [Cancel]
student → taps Start            bot → question 1 (options as a tappable list)
student → taps an option        …    → last question → auto-submit
                                bot → score in the chat  +  result to parent_phone
```

The attempt is graded by `portal.submit_attempt` (so `max_attempts` is enforced
and it lands in `attempts`). The score is echoed to the student's chat **and**
sent to the `parent_phone` on the student record as a detailed **template
message** — student name, class + section, subject, topic, assignment title,
correct-answers count, marks, and percentage (business-initiated messages to a
number that hasn't messaged us must use an approved template). If `parent_phone`
happens to be the same number the student is chatting from and the template
send fails (e.g. not approved yet), the same detail is sent as a plain-text
fallback instead — that only works because it's the same number, inside the
free-form 24h window.

**Setup**

1. Meta Business account → an app with the **WhatsApp** product → a phone number.
2. Fill `backend/.env`:
   ```
   WHATSAPP_TOKEN=                 # permanent access token
   WHATSAPP_PHONE_NUMBER_ID=       # "Phone number ID" from API Setup
   WHATSAPP_VERIFY_TOKEN=          # any string you choose
   WHATSAPP_RESULT_TEMPLATE=test_result
   WHATSAPP_TEMPLATE_LANG=en
   WHATSAPP_APP_SECRET=            # optional — verifies X-Hub-Signature-256
   ```
3. Run `sql/schema.sql` again (adds `wa_sessions`).
4. Expose the backend over HTTPS (e.g. `ngrok http 8000`) and in the Meta app set
   the **Callback URL** to `https://<host>/api/whatsapp/webhook` with the same
   **Verify token**; subscribe to the **messages** field.
5. Create a message template named `test_result` (category *Utility*) with **8**
   body variables, e.g.:
   ```
   Hello! Here is your child's test result from Vizag International School.

   Student: {{1}}
   Class: {{2}}
   Subject: {{3}} • Topic: {{4}}
   Test: {{5}}

   Correct answers: {{6}}
   Marks scored: {{7}}
   Percentage: {{8}}%
   ```
   The bot fills, in order: student name, `"<class> - <section>"`, subject,
   topic, assignment title, `"<correct> out of <total>"`, `"<earned> / <max>"`,
   percentage. Wait for Meta to approve it — until then results still work, they
   just won't reach a parent number that hasn't messaged the bot (see below).

`GET /api/whatsapp/status` reports whether the token/number are configured.
Without them the bot logs the payloads it *would* send instead of calling Meta,
so the flow is still testable.

### Admin analytics & examinations (`app/reports.py`)

`/api/admin/overview` powers the admin dashboard: total students / assignments /
questions, attempts in the last 30 days, a 30-day attempts-per-day series,
attempts + average score per class, students per class, most-attempted
assignments, and the most recent results.

`/api/exam/results` lists every student attempt (student, class/section,
assignment, subject/topic, attempt no, score, %, submitted at), filterable by
`class_id` and `assignment_id`. `/api/exam/attempts/{id}` re-grades one attempt
for the per-question breakdown. `/api/exam/export` streams the filtered set as an
`.xlsx` (built with openpyxl).

Dashboard data is mock data in `app/data.py`.

## Bulk question import

`POST /api/academics/assignments/{id}/questions/bulk` accepts a `.docx` or
`.xlsx` file and adds every question it can parse. Response:
`{ parsed, added, skipped, notes[] }`.

**Excel** — first row is a header. Recognised columns: `question`,
`option_a`…`option_f` (or a single `options` column split on `|`, `;`, newline),
`answer` (a letter `A`/`B`/… or the full option text), `marks`.

**Word** — two layouts are auto-detected:

*School paper layout* (numbered question paragraphs, options in a 2×2 table per
question, answers in a `Q.No./Ans.` key table at the end) — this is the format
of `sample_uploads/Class_VIII_Force_30_MCQs_with_Answer_Key.docx`:

```
1. Force is best defined as a:
┌─────────────────────┬───────────────────┐
│ A. Push or pull     │ B. Type of energy │
│ C. Form of matter   │ D. Unit of mass   │
└─────────────────────┴───────────────────┘
...
FORCE – ANSWER KEY
┌───────┬──────┬───────┬──────┬───────┬──────┐
│ Q.No. │ Ans. │ Q.No. │ Ans. │ Q.No. │ Ans. │
│ 1     │ A    │ 11    │ B    │ 21    │ C    │
└───────┴──────┴───────┴──────┴───────┴──────┘
```

*Inline layout*:

```
1. The degree of 4x^3 + 2x + 7 is:
A) 1
B) 2
C) 3
D) 7
Answer: C
```

Also handled: an inline `Answer: C` line after a question, or the correct
option shown in **bold**.

Sample files: [`sample_uploads/`](sample_uploads/).
