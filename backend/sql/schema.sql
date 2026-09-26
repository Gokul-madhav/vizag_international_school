-- ---------------------------------------------------------------------------
-- Vizag International School — academic structure schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
--   classes ──< sections
--           └─< subjects ──< topics ──< assignments ──< questions
--
-- Every FK is ON DELETE CASCADE, so deleting a class removes everything
-- beneath it.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sections (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.assignments (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.topics (id) on delete cascade,
  title        text not null,
  instructions text not null default '',
  max_attempts int not null default 1,
  created_at   timestamptz not null default now()
);

-- if the table already exists from an earlier run:
alter table public.assignments add column if not exists max_attempts int not null default 1;

-- MCQ questions. `options` is a JSON array of strings; `answer` holds the exact
-- text of the correct option (empty string = not set / needs review).
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  text          text not null,
  options       jsonb not null default '[]'::jsonb,
  answer        text not null default '',
  marks         int not null default 1,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  student_id   text,
  name         text not null,
  class_id     uuid not null references public.classes (id) on delete cascade,
  section_id   uuid references public.sections (id) on delete set null,
  parent_name  text not null default '',
  parent_phone text not null default '',
  created_at   timestamptz not null default now()
);

-- if you ran an earlier version of this file, the students table already
-- exists without student_id; add it in place before indexing it.
alter table public.students add column if not exists student_id text;

-- a school-assigned id, unique when present (rows may be imported without one)
create unique index if not exists students_student_id_key
  on public.students (student_id) where student_id is not null;

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- a student's graded attempt at an assignment
create table if not exists public.attempts (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  attempt_no    int not null default 1,
  answers       jsonb not null default '{}'::jsonb,
  score         int not null default 0,
  total         int not null default 0,
  earned        int not null default 0,
  max_score     int not null default 0,
  percentage    numeric not null default 0,
  submitted_at  timestamptz not null default now()
);
create index if not exists attempts_student_idx on public.attempts (student_id);
create index if not exists attempts_assignment_idx on public.attempts (assignment_id);

-- transient WhatsApp-bot conversation state, keyed by the messaging phone number.
-- Deliberately NOT linked to students by FK: the number is not a durable
-- identifier (a student may take a test from any phone). Rows are deleted when a
-- test finishes and are treated as expired after ~30 min of inactivity.
create table if not exists public.wa_sessions (
  phone         text primary key,
  student_pk    uuid,
  student_id    text,
  state         text not null default 'AWAITING_ID',
  assignment_id uuid,
  q_index       int not null default 0,
  answers       jsonb not null default '{}'::jsonb,
  questions     jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

-- "New student" enquiry leads: a prospective student who types "new" at
-- sign-in fills a short form and is registered as a real row in `students`
-- (generated student_id `NEW-XXXXXX`) so they can take the assignment they
-- clicked through from with the normal graded portal flow. The lead-only
-- fields (and which test link brought them in) live here, pointing back at
-- that student row. Shown to the admin under New Students.
create table if not exists public.leads (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.students (id) on delete cascade,
  current_school       text not null default '',
  previous_percentage  numeric,
  assignment_id        uuid references public.assignments (id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists leads_student_idx on public.leads (student_id);

create index if not exists sections_class_id_idx     on public.sections (class_id);
create index if not exists subjects_class_id_idx     on public.subjects (class_id);
create index if not exists topics_subject_id_idx     on public.topics (subject_id);
create index if not exists assignments_topic_id_idx  on public.assignments (topic_id);
create index if not exists questions_assignment_idx  on public.questions (assignment_id);
create index if not exists students_class_id_idx     on public.students (class_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- The backend uses the SERVICE ROLE key, which bypasses RLS, so no policies
-- are required. RLS is still enabled so the tables are not world-writable if
-- the anon key is ever exposed.
-- ---------------------------------------------------------------------------

alter table public.classes     enable row level security;
alter table public.sections    enable row level security;
alter table public.subjects    enable row level security;
alter table public.topics      enable row level security;
alter table public.assignments enable row level security;
alter table public.questions   enable row level security;
alter table public.students     enable row level security;
alter table public.app_settings enable row level security;
alter table public.attempts     enable row level security;
alter table public.wa_sessions  enable row level security;
alter table public.leads        enable row level security;

-- Optional: uncomment to let the anon/authenticated keys read+write directly
-- (only if you later move CRUD calls into the frontend).
--
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['classes','sections','subjects','topics','assignments','questions','students','app_settings','attempts']
--   loop
--     execute format('create policy %I on public.%I for all using (true) with check (true)', t||'_all', t);
--   end loop;
-- end $$;
