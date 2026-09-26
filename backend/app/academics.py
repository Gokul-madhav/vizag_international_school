"""Academic structure feature.

    classes ─< sections
            └─< subjects ─< topics ─< assignments ─< questions (MCQ)

Storage is pluggable:
  * Supabase when SUPABASE_URL + SUPABASE_SERVICE_KEY are set (and `supabase`
    is installed).
  * Otherwise an in-memory store, seeded with sample data (reset on restart).
"""

from __future__ import annotations

import os
import threading
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .question_import import clean_parsed, parse_upload


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #

class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class SectionIn(BaseModel):
    class_id: str
    name: str = Field(min_length=1, max_length=40)


class SubjectIn(BaseModel):
    class_id: str
    name: str = Field(min_length=1, max_length=80)


class TopicIn(BaseModel):
    subject_id: str
    name: str = Field(min_length=1, max_length=120)
    description: str = ""


class RenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class AssignmentIn(BaseModel):
    topic_id: str
    title: str = Field(min_length=1, max_length=160)
    instructions: str = ""
    max_attempts: int = Field(default=1, ge=1, le=20)


class AssignmentUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    instructions: str = ""
    max_attempts: int = Field(default=1, ge=1, le=20)


class QuestionIn(BaseModel):
    assignment_id: str
    text: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=8)
    answer: str = ""
    marks: int = Field(default=1, ge=0, le=100)


class QuestionUpdate(BaseModel):
    text: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=8)
    answer: str = ""
    marks: int = Field(default=1, ge=0, le=100)


# --------------------------------------------------------------------------- #
# In-memory repository
# --------------------------------------------------------------------------- #

class MemoryAcademicRepo:
    backend = "memory"

    def __init__(self, seed: bool = True):
        self._lock = threading.RLock()
        self._classes: dict[str, dict] = {}
        self._sections: dict[str, dict] = {}
        self._subjects: dict[str, dict] = {}
        self._topics: dict[str, dict] = {}
        self._assignments: dict[str, dict] = {}
        self._questions: dict[str, dict] = {}
        if seed:
            self._seed()

    @staticmethod
    def _id() -> str:
        return uuid.uuid4().hex

    def _seed(self) -> None:
        c1 = self.add_class("Grade IX")
        self.add_section(c1["id"], "A")
        self.add_section(c1["id"], "B")
        math = self.add_subject(c1["id"], "Mathematics")
        poly = self.add_topic(math["id"], "Polynomials", "Degree, zeros, factor theorem")
        self.add_topic(math["id"], "Number Systems", "Rational & irrational numbers")
        sci = self.add_subject(c1["id"], "Science")
        self.add_topic(sci["id"], "Matter in Our Surroundings", "")

        a1 = self.add_assignment(
            poly["id"], "Polynomials — Quiz 1", "Attempt all questions. 1 mark each.", max_attempts=2
        )
        self.add_question(
            a1["id"],
            "The degree of the polynomial 4x^3 + 2x + 7 is:",
            ["1", "2", "3", "7"],
            "3",
            1,
        )
        self.add_question(
            a1["id"],
            "Which of the following is a zero of p(x) = x^2 - 5x + 6?",
            ["1", "2", "5", "6"],
            "2",
            1,
        )

        c2 = self.add_class("Grade X")
        self.add_section(c2["id"], "A")
        self.add_subject(c2["id"], "Social Studies")

    # -- classes --------------------------------------------------------- #
    def add_class(self, name: str) -> dict:
        with self._lock:
            row = {"id": self._id(), "name": name.strip()}
            self._classes[row["id"]] = row
            return dict(row)

    def rename_class(self, class_id: str, name: str) -> dict:
        with self._lock:
            row = self._classes.get(class_id)
            if not row:
                raise KeyError(class_id)
            row["name"] = name.strip()
            return dict(row)

    def delete_class(self, class_id: str) -> None:
        with self._lock:
            self._classes.pop(class_id, None)
            for sid in [s["id"] for s in self._sections.values() if s["class_id"] == class_id]:
                self._sections.pop(sid, None)
            for sub_id in [s["id"] for s in self._subjects.values() if s["class_id"] == class_id]:
                self._delete_subject_nolock(sub_id)

    # -- sections ------------------------------------------------------ #
    def add_section(self, class_id: str, name: str) -> dict:
        with self._lock:
            if class_id not in self._classes:
                raise KeyError(class_id)
            row = {"id": self._id(), "class_id": class_id, "name": name.strip()}
            self._sections[row["id"]] = row
            return dict(row)

    def delete_section(self, section_id: str) -> None:
        with self._lock:
            self._sections.pop(section_id, None)

    # -- subjects ---------------------------------------------------- #
    def add_subject(self, class_id: str, name: str) -> dict:
        with self._lock:
            if class_id not in self._classes:
                raise KeyError(class_id)
            row = {"id": self._id(), "class_id": class_id, "name": name.strip()}
            self._subjects[row["id"]] = row
            return dict(row)

    def rename_subject(self, subject_id: str, name: str) -> dict:
        with self._lock:
            row = self._subjects.get(subject_id)
            if not row:
                raise KeyError(subject_id)
            row["name"] = name.strip()
            return dict(row)

    def _delete_subject_nolock(self, subject_id: str) -> None:
        self._subjects.pop(subject_id, None)
        for tid in [t["id"] for t in self._topics.values() if t["subject_id"] == subject_id]:
            self._delete_topic_nolock(tid)

    def delete_subject(self, subject_id: str) -> None:
        with self._lock:
            self._delete_subject_nolock(subject_id)

    # -- topics ---------------------------------------------------- #
    def add_topic(self, subject_id: str, name: str, description: str = "") -> dict:
        with self._lock:
            if subject_id not in self._subjects:
                raise KeyError(subject_id)
            row = {
                "id": self._id(),
                "subject_id": subject_id,
                "name": name.strip(),
                "description": (description or "").strip(),
            }
            self._topics[row["id"]] = row
            return dict(row)

    def update_topic(self, topic_id: str, name: str, description: str = "") -> dict:
        with self._lock:
            row = self._topics.get(topic_id)
            if not row:
                raise KeyError(topic_id)
            row["name"] = name.strip()
            row["description"] = (description or "").strip()
            return dict(row)

    def _delete_topic_nolock(self, topic_id: str) -> None:
        self._topics.pop(topic_id, None)
        for aid in [a["id"] for a in self._assignments.values() if a["topic_id"] == topic_id]:
            self._delete_assignment_nolock(aid)

    def delete_topic(self, topic_id: str) -> None:
        with self._lock:
            self._delete_topic_nolock(topic_id)

    # -- assignments -------------------------------------------- #
    def add_assignment(
        self, topic_id: str, title: str, instructions: str = "", max_attempts: int = 1
    ) -> dict:
        with self._lock:
            if topic_id not in self._topics:
                raise KeyError(topic_id)
            row = {
                "id": self._id(),
                "topic_id": topic_id,
                "title": title.strip(),
                "instructions": (instructions or "").strip(),
                "max_attempts": int(max_attempts or 1),
            }
            self._assignments[row["id"]] = row
            return dict(row)

    def update_assignment(
        self, assignment_id: str, title: str, instructions: str = "", max_attempts: int = 1
    ) -> dict:
        with self._lock:
            row = self._assignments.get(assignment_id)
            if not row:
                raise KeyError(assignment_id)
            row["title"] = title.strip()
            row["instructions"] = (instructions or "").strip()
            row["max_attempts"] = int(max_attempts or 1)
            return dict(row)

    def _delete_assignment_nolock(self, assignment_id: str) -> None:
        self._assignments.pop(assignment_id, None)
        for qid in [q["id"] for q in self._questions.values() if q["assignment_id"] == assignment_id]:
            self._questions.pop(qid, None)

    def delete_assignment(self, assignment_id: str) -> None:
        with self._lock:
            self._delete_assignment_nolock(assignment_id)

    def get_assignment(self, assignment_id: str) -> dict:
        with self._lock:
            a = self._assignments.get(assignment_id)
            if not a:
                raise KeyError(assignment_id)
            topic = self._topics.get(a["topic_id"], {})
            subject = self._subjects.get(topic.get("subject_id", ""), {})
            qs = sorted(
                (q for q in self._questions.values() if q["assignment_id"] == assignment_id),
                key=lambda r: r["position"],
            )
            return {
                **a,
                "topic": topic.get("name"),
                "subject": subject.get("name"),
                "questions": [
                    {k: q[k] for k in ("id", "text", "options", "answer", "marks", "position")}
                    for q in qs
                ],
            }

    # -- questions ------------------------------------------- #
    def _insert_question(self, assignment_id, text, options, answer, marks) -> dict:
        pos = sum(1 for q in self._questions.values() if q["assignment_id"] == assignment_id)
        row = {
            "id": self._id(),
            "assignment_id": assignment_id,
            "text": text.strip(),
            "options": [str(o).strip() for o in options],
            "answer": (answer or "").strip(),
            "marks": int(marks or 1),
            "position": pos,
        }
        self._questions[row["id"]] = row
        return dict(row)

    def add_question(self, assignment_id, text, options, answer="", marks=1) -> dict:
        with self._lock:
            if assignment_id not in self._assignments:
                raise KeyError(assignment_id)
            return self._insert_question(assignment_id, text, options, answer, marks)

    def update_question(self, question_id, text, options, answer="", marks=1) -> dict:
        with self._lock:
            row = self._questions.get(question_id)
            if not row:
                raise KeyError(question_id)
            row["text"] = text.strip()
            row["options"] = [str(o).strip() for o in options]
            row["answer"] = (answer or "").strip()
            row["marks"] = int(marks or 1)
            return dict(row)

    def delete_question(self, question_id: str) -> None:
        with self._lock:
            self._questions.pop(question_id, None)

    def bulk_add_questions(self, assignment_id: str, items: list[dict]) -> int:
        with self._lock:
            if assignment_id not in self._assignments:
                raise KeyError(assignment_id)
            for it in items:
                self._insert_question(
                    assignment_id, it["text"], it["options"], it.get("answer", ""), it.get("marks", 1)
                )
            return len(items)

    # -- tree ---------------------------------------------- #
    def tree(self) -> dict:
        with self._lock:
            qcount: dict[str, int] = {}
            qmarks: dict[str, int] = {}
            for q in self._questions.values():
                qcount[q["assignment_id"]] = qcount.get(q["assignment_id"], 0) + 1
                qmarks[q["assignment_id"]] = qmarks.get(q["assignment_id"], 0) + int(q.get("marks", 1))

            assignments_by_topic: dict[str, list] = {}
            for a in sorted(self._assignments.values(), key=lambda r: r["title"].lower()):
                assignments_by_topic.setdefault(a["topic_id"], []).append(
                    {
                        "id": a["id"],
                        "title": a["title"],
                        "instructions": a["instructions"],
                        "max_attempts": a.get("max_attempts", 1),
                        "question_count": qcount.get(a["id"], 0),
                        "total_marks": qmarks.get(a["id"], 0),
                    }
                )

            topics_by_subject: dict[str, list] = {}
            for t in sorted(self._topics.values(), key=lambda r: r["name"].lower()):
                topics_by_subject.setdefault(t["subject_id"], []).append(
                    {
                        "id": t["id"],
                        "name": t["name"],
                        "description": t["description"],
                        "assignments": assignments_by_topic.get(t["id"], []),
                    }
                )

            subjects_by_class: dict[str, list] = {}
            for s in sorted(self._subjects.values(), key=lambda r: r["name"].lower()):
                subjects_by_class.setdefault(s["class_id"], []).append(
                    {"id": s["id"], "name": s["name"], "topics": topics_by_subject.get(s["id"], [])}
                )

            sections_by_class: dict[str, list] = {}
            for s in sorted(self._sections.values(), key=lambda r: r["name"].lower()):
                sections_by_class.setdefault(s["class_id"], []).append({"id": s["id"], "name": s["name"]})

            classes = [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "sections": sections_by_class.get(c["id"], []),
                    "subjects": subjects_by_class.get(c["id"], []),
                }
                for c in sorted(self._classes.values(), key=lambda r: r["name"].lower())
            ]
            return {"classes": classes, "backend": self.backend}


# --------------------------------------------------------------------------- #
# Supabase repository
# --------------------------------------------------------------------------- #

class SupabaseAcademicRepo:
    backend = "supabase"

    def __init__(self, client):
        self.c = client

    def _one(self, res):
        data = getattr(res, "data", None) or []
        if not data:
            raise RuntimeError("Supabase returned no row")
        return data[0]

    def _updated(self, res, key):
        data = getattr(res, "data", None) or []
        if not data:
            raise KeyError(key)
        return data[0]

    # -- classes --------------------------------------------------------- #
    def add_class(self, name):
        return self._one(self.c.table("classes").insert({"name": name.strip()}).execute())

    def rename_class(self, class_id, name):
        return self._updated(
            self.c.table("classes").update({"name": name.strip()}).eq("id", class_id).execute(), class_id
        )

    def delete_class(self, class_id):
        self.c.table("classes").delete().eq("id", class_id).execute()

    # -- sections ------------------------------------------------------ #
    def add_section(self, class_id, name):
        return self._one(
            self.c.table("sections").insert({"class_id": class_id, "name": name.strip()}).execute()
        )

    def delete_section(self, section_id):
        self.c.table("sections").delete().eq("id", section_id).execute()

    # -- subjects -------------------------------------------------- #
    def add_subject(self, class_id, name):
        return self._one(
            self.c.table("subjects").insert({"class_id": class_id, "name": name.strip()}).execute()
        )

    def rename_subject(self, subject_id, name):
        return self._updated(
            self.c.table("subjects").update({"name": name.strip()}).eq("id", subject_id).execute(), subject_id
        )

    def delete_subject(self, subject_id):
        self.c.table("subjects").delete().eq("id", subject_id).execute()

    # -- topics -------------------------------------------------- #
    def add_topic(self, subject_id, name, description=""):
        return self._one(
            self.c.table("topics")
            .insert({"subject_id": subject_id, "name": name.strip(), "description": (description or "").strip()})
            .execute()
        )

    def update_topic(self, topic_id, name, description=""):
        return self._updated(
            self.c.table("topics")
            .update({"name": name.strip(), "description": (description or "").strip()})
            .eq("id", topic_id)
            .execute(),
            topic_id,
        )

    def delete_topic(self, topic_id):
        self.c.table("topics").delete().eq("id", topic_id).execute()

    # -- assignments ------------------------------------------ #
    def add_assignment(self, topic_id, title, instructions="", max_attempts=1):
        return self._one(
            self.c.table("assignments")
            .insert(
                {
                    "topic_id": topic_id,
                    "title": title.strip(),
                    "instructions": (instructions or "").strip(),
                    "max_attempts": int(max_attempts or 1),
                }
            )
            .execute()
        )

    def update_assignment(self, assignment_id, title, instructions="", max_attempts=1):
        return self._updated(
            self.c.table("assignments")
            .update(
                {
                    "title": title.strip(),
                    "instructions": (instructions or "").strip(),
                    "max_attempts": int(max_attempts or 1),
                }
            )
            .eq("id", assignment_id)
            .execute(),
            assignment_id,
        )

    def delete_assignment(self, assignment_id):
        self.c.table("assignments").delete().eq("id", assignment_id).execute()

    def get_assignment(self, assignment_id):
        try:
            rows = (
                self.c.table("assignments")
                .select("*, topics(name, subjects(name))")
                .eq("id", assignment_id)
                .limit(1)
                .execute()
                .data
                or []
            )
        except Exception:  # noqa: BLE001 - embed not available
            rows = (
                self.c.table("assignments").select("*").eq("id", assignment_id).limit(1).execute().data
                or []
            )
        if not rows:
            raise KeyError(assignment_id)
        row = dict(rows[0])
        topic = row.pop("topics", None) or {}
        subject = topic.get("subjects") or {} if isinstance(topic, dict) else {}
        row["topic"] = topic.get("name") if isinstance(topic, dict) else None
        row["subject"] = subject.get("name") if isinstance(subject, dict) else None
        questions = (
            self.c.table("questions")
            .select("*")
            .eq("assignment_id", assignment_id)
            .order("position")
            .execute()
            .data
            or []
        )
        return {**row, "questions": questions}

    # -- questions --------------------------------------- #
    def _next_position(self, assignment_id) -> int:
        rows = self.c.table("questions").select("position").eq("assignment_id", assignment_id).execute().data or []
        return (max((r["position"] for r in rows), default=-1)) + 1

    def add_question(self, assignment_id, text, options, answer="", marks=1):
        return self._one(
            self.c.table("questions")
            .insert(
                {
                    "assignment_id": assignment_id,
                    "text": text.strip(),
                    "options": [str(o).strip() for o in options],
                    "answer": (answer or "").strip(),
                    "marks": int(marks or 1),
                    "position": self._next_position(assignment_id),
                }
            )
            .execute()
        )

    def update_question(self, question_id, text, options, answer="", marks=1):
        return self._updated(
            self.c.table("questions")
            .update(
                {
                    "text": text.strip(),
                    "options": [str(o).strip() for o in options],
                    "answer": (answer or "").strip(),
                    "marks": int(marks or 1),
                }
            )
            .eq("id", question_id)
            .execute(),
            question_id,
        )

    def delete_question(self, question_id):
        self.c.table("questions").delete().eq("id", question_id).execute()

    def bulk_add_questions(self, assignment_id, items):
        if not items:
            return 0
        start = self._next_position(assignment_id)
        rows = [
            {
                "assignment_id": assignment_id,
                "text": it["text"].strip(),
                "options": [str(o).strip() for o in it["options"]],
                "answer": (it.get("answer") or "").strip(),
                "marks": int(it.get("marks") or 1),
                "position": start + i,
            }
            for i, it in enumerate(items)
        ]
        res = self.c.table("questions").insert(rows).execute()
        return len(getattr(res, "data", None) or rows)

    # -- tree ------------------------------------------- #
    def tree(self):
        """One embedded query; falls back to six plain selects if the embed fails."""
        try:
            rows = (
                self.c.table("classes")
                .select(
                    "id, name, sections(id, name), "
                    "subjects(id, name, topics(id, name, description, "
                    "assignments(id, title, instructions, max_attempts, questions(id, marks))))"
                )
                .order("name")
                .execute()
                .data
                or []
            )
        except Exception:  # noqa: BLE001
            return self._tree_fallback()

        def _num(x):
            return (x or "").lower()

        out = []
        for c in rows:
            subjects = []
            for s in sorted(c.get("subjects") or [], key=lambda r: _num(r.get("name"))):
                topics = []
                for t in sorted(s.get("topics") or [], key=lambda r: _num(r.get("name"))):
                    assignments = []
                    for a in sorted(t.get("assignments") or [], key=lambda r: _num(r.get("title"))):
                        qs = a.get("questions") or []
                        assignments.append(
                            {
                                "id": a["id"],
                                "title": a["title"],
                                "instructions": a.get("instructions") or "",
                                "max_attempts": a.get("max_attempts") or 1,
                                "question_count": len(qs),
                                "total_marks": sum(int(q.get("marks") or 1) for q in qs),
                            }
                        )
                    topics.append(
                        {
                            "id": t["id"],
                            "name": t["name"],
                            "description": t.get("description") or "",
                            "assignments": assignments,
                        }
                    )
                subjects.append({"id": s["id"], "name": s["name"], "topics": topics})
            sections = sorted(
                ({"id": x["id"], "name": x["name"]} for x in (c.get("sections") or [])),
                key=lambda r: r["name"].lower(),
            )
            out.append(
                {"id": c["id"], "name": c["name"], "sections": list(sections), "subjects": subjects}
            )
        return {"classes": out, "backend": self.backend}

    def _tree_fallback(self):
        classes = self.c.table("classes").select("*").order("name").execute().data or []
        sections = self.c.table("sections").select("*").order("name").execute().data or []
        subjects = self.c.table("subjects").select("*").order("name").execute().data or []
        topics = self.c.table("topics").select("*").order("name").execute().data or []
        assignments = self.c.table("assignments").select("*").order("title").execute().data or []
        q_rows = self.c.table("questions").select("assignment_id, marks").execute().data or []

        qcount: dict[str, int] = {}
        qmarks: dict[str, int] = {}
        for q in q_rows:
            qcount[q["assignment_id"]] = qcount.get(q["assignment_id"], 0) + 1
            qmarks[q["assignment_id"]] = qmarks.get(q["assignment_id"], 0) + int(q.get("marks") or 1)

        assignments_by_topic: dict[str, list] = {}
        for a in assignments:
            assignments_by_topic.setdefault(a["topic_id"], []).append(
                {
                    "id": a["id"],
                    "title": a["title"],
                    "instructions": a.get("instructions") or "",
                    "max_attempts": a.get("max_attempts") or 1,
                    "question_count": qcount.get(a["id"], 0),
                    "total_marks": qmarks.get(a["id"], 0),
                }
            )

        topics_by_subject: dict[str, list] = {}
        for t in topics:
            topics_by_subject.setdefault(t["subject_id"], []).append(
                {
                    "id": t["id"],
                    "name": t["name"],
                    "description": t.get("description") or "",
                    "assignments": assignments_by_topic.get(t["id"], []),
                }
            )

        subjects_by_class: dict[str, list] = {}
        for s in subjects:
            subjects_by_class.setdefault(s["class_id"], []).append(
                {"id": s["id"], "name": s["name"], "topics": topics_by_subject.get(s["id"], [])}
            )

        sections_by_class: dict[str, list] = {}
        for s in sections:
            sections_by_class.setdefault(s["class_id"], []).append({"id": s["id"], "name": s["name"]})

        return {
            "classes": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "sections": sections_by_class.get(c["id"], []),
                    "subjects": subjects_by_class.get(c["id"], []),
                }
                for c in classes
            ],
            "backend": self.backend,
        }


# --------------------------------------------------------------------------- #
# Repo factory
# --------------------------------------------------------------------------- #

def _warn_if_not_service_key(key: str) -> None:
    """Best-effort check that the Supabase key can bypass RLS (writes need it)."""
    role = None
    if key.startswith("sb_publishable_"):
        role = "publishable"
    elif key.count(".") == 2:  # looks like a JWT (legacy anon/service_role key)
        import base64
        import json

        try:
            payload = key.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            role = json.loads(base64.urlsafe_b64decode(payload)).get("role")
        except Exception:  # noqa: BLE001
            return
    if role and role not in ("service_role",):
        print(
            f"[academics] WARNING: SUPABASE_SERVICE_KEY looks like a '{role}' key. "
            "Reads will be empty and writes will fail under RLS. Use the "
            "service_role (secret) key from Project Settings -> API."
        )


def _build_repo():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if url and key:
        try:
            from supabase import create_client

            _warn_if_not_service_key(key)
            print("[academics] using Supabase backend")
            return SupabaseAcademicRepo(create_client(url, key))
        except Exception as exc:  # noqa: BLE001
            print(f"[academics] Supabase init failed ({exc!r}); using in-memory store")
    else:
        print("[academics] SUPABASE_URL / SUPABASE_SERVICE_KEY not set; using in-memory store")
    return MemoryAcademicRepo()


repo = _build_repo()


# --------------------------------------------------------------------------- #
# Router
# --------------------------------------------------------------------------- #

router = APIRouter(prefix="/api/academics", tags=["academics"])


def _guard(fn, *args, not_found: str = "Not found"):
    try:
        return fn(*args)
    except KeyError:
        raise HTTPException(status_code=404, detail=not_found)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/status")
def status():
    return {"backend": repo.backend}


@router.get("/tree")
def get_tree():
    return _guard(repo.tree)


# ---- classes ------------------------------------------------------------- #
@router.post("/classes")
def create_class(body: ClassIn):
    return _guard(repo.add_class, body.name)


@router.patch("/classes/{class_id}")
def rename_class(class_id: str, body: RenameIn):
    return _guard(repo.rename_class, class_id, body.name, not_found="Class not found")


@router.delete("/classes/{class_id}")
def remove_class(class_id: str):
    _guard(repo.delete_class, class_id)
    return {"ok": True}


# ---- sections -------------------------------------------------------- #
@router.post("/sections")
def create_section(body: SectionIn):
    return _guard(repo.add_section, body.class_id, body.name, not_found="Class not found")


@router.delete("/sections/{section_id}")
def remove_section(section_id: str):
    _guard(repo.delete_section, section_id)
    return {"ok": True}


# ---- subjects ---------------------------------------------------- #
@router.post("/subjects")
def create_subject(body: SubjectIn):
    return _guard(repo.add_subject, body.class_id, body.name, not_found="Class not found")


@router.patch("/subjects/{subject_id}")
def rename_subject(subject_id: str, body: RenameIn):
    return _guard(repo.rename_subject, subject_id, body.name, not_found="Subject not found")


@router.delete("/subjects/{subject_id}")
def remove_subject(subject_id: str):
    _guard(repo.delete_subject, subject_id)
    return {"ok": True}


# ---- topics ---------------------------------------------------- #
@router.post("/topics")
def create_topic(body: TopicIn):
    return _guard(repo.add_topic, body.subject_id, body.name, body.description, not_found="Subject not found")


@router.patch("/topics/{topic_id}")
def edit_topic(topic_id: str, body: TopicIn):
    return _guard(repo.update_topic, topic_id, body.name, body.description, not_found="Topic not found")


@router.delete("/topics/{topic_id}")
def remove_topic(topic_id: str):
    _guard(repo.delete_topic, topic_id)
    return {"ok": True}


# ---- assignments -------------------------------------------- #
@router.post("/assignments")
def create_assignment(body: AssignmentIn):
    return _guard(
        repo.add_assignment,
        body.topic_id,
        body.title,
        body.instructions,
        body.max_attempts,
        not_found="Topic not found",
    )


@router.get("/assignments/{assignment_id}")
def read_assignment(assignment_id: str):
    return _guard(repo.get_assignment, assignment_id, not_found="Assignment not found")


@router.patch("/assignments/{assignment_id}")
def edit_assignment(assignment_id: str, body: AssignmentUpdate):
    return _guard(
        repo.update_assignment,
        assignment_id,
        body.title,
        body.instructions,
        body.max_attempts,
        not_found="Assignment not found",
    )


@router.delete("/assignments/{assignment_id}")
def remove_assignment(assignment_id: str):
    _guard(repo.delete_assignment, assignment_id)
    return {"ok": True}


# ---- questions -------------------------------------------- #
@router.post("/questions")
def create_question(body: QuestionIn):
    return _guard(
        repo.add_question,
        body.assignment_id,
        body.text,
        body.options,
        body.answer,
        body.marks,
        not_found="Assignment not found",
    )


@router.patch("/questions/{question_id}")
def edit_question(question_id: str, body: QuestionUpdate):
    return _guard(
        repo.update_question,
        question_id,
        body.text,
        body.options,
        body.answer,
        body.marks,
        not_found="Question not found",
    )


@router.delete("/questions/{question_id}")
def remove_question(question_id: str):
    _guard(repo.delete_question, question_id)
    return {"ok": True}


@router.post("/assignments/{assignment_id}/questions/bulk")
async def bulk_upload_questions(assignment_id: str, file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    try:
        parsed = parse_upload(file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read the file: {exc}")

    valid, notes = clean_parsed(parsed)
    added = _guard(repo.bulk_add_questions, assignment_id, valid, not_found="Assignment not found")
    return {
        "parsed": len(parsed),
        "added": added,
        "skipped": len(parsed) - added,
        "notes": notes,
    }
