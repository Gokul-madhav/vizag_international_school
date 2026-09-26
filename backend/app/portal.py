"""Student-facing portal: log in with a student ID, see the assignments for
your class, take them (respecting the admin's attempt limit) and get a graded
result with the correct answers revealed.

No passwords — the student ID is the key, matching the demo's no-auth approach.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .academics import repo as academic_repo
from .students import repo as students_repo


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# attempts storage
# --------------------------------------------------------------------------- #

class MemoryAttemptRepo:
    backend = "memory"

    def __init__(self):
        self._lock = threading.RLock()
        self._rows: dict[str, dict] = {}

    def list_all(self) -> list[dict]:
        with self._lock:
            return sorted((dict(r) for r in self._rows.values()), key=lambda r: r["submitted_at"])

    def get(self, attempt_id: str) -> dict | None:
        with self._lock:
            r = self._rows.get(attempt_id)
            return dict(r) if r else None

    def list_for_student(self, student_pk: str) -> list[dict]:
        with self._lock:
            rows = [dict(r) for r in self._rows.values() if r["student_id"] == student_pk]
        return sorted(rows, key=lambda r: r["submitted_at"])

    def list_for(self, student_pk: str, assignment_id: str) -> list[dict]:
        return [
            r
            for r in self.list_for_student(student_pk)
            if r["assignment_id"] == assignment_id
        ]

    def add(self, data: dict) -> dict:
        with self._lock:
            row = {"id": uuid.uuid4().hex, "submitted_at": _now_iso(), **data}
            self._rows[row["id"]] = row
            return dict(row)


class SupabaseAttemptRepo:
    backend = "supabase"

    def __init__(self, client):
        self.c = client

    def list_all(self) -> list[dict]:
        return (
            self.c.table("attempts").select("*").order("submitted_at").execute().data or []
        )

    def get(self, attempt_id: str) -> dict | None:
        rows = (
            self.c.table("attempts").select("*").eq("id", attempt_id).limit(1).execute().data or []
        )
        return rows[0] if rows else None

    def list_for_student(self, student_pk: str) -> list[dict]:
        return (
            self.c.table("attempts")
            .select("*")
            .eq("student_id", student_pk)
            .order("submitted_at")
            .execute()
            .data
            or []
        )

    def list_for(self, student_pk: str, assignment_id: str) -> list[dict]:
        return (
            self.c.table("attempts")
            .select("*")
            .eq("student_id", student_pk)
            .eq("assignment_id", assignment_id)
            .order("attempt_no")
            .execute()
            .data
            or []
        )

    def add(self, data: dict) -> dict:
        rows = self.c.table("attempts").insert(data).execute().data or []
        return rows[0] if rows else {**data, "id": None, "submitted_at": _now_iso()}


attempt_repo = (
    SupabaseAttemptRepo(academic_repo.c)
    if getattr(academic_repo, "backend", "") == "supabase"
    else MemoryAttemptRepo()
)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def _profile_from(match: dict, tree: dict) -> dict:
    cls = next((c for c in tree["classes"] if c["id"] == match["class_id"]), None)
    sec = None
    if cls and match.get("section_id"):
        sec = next((x for x in cls["sections"] if x["id"] == match["section_id"]), None)
    return {
        "id": match["id"],
        "student_id": match.get("student_id"),
        "name": match["name"],
        "class_id": match["class_id"],
        "class_name": cls["name"] if cls else "—",
        "section_id": match.get("section_id"),
        "section_name": sec["name"] if sec else None,
        "parent_name": match.get("parent_name", ""),
        "parent_phone": match.get("parent_phone", ""),
    }


def resolve_student(student_id_text: str) -> dict:
    match = students_repo.get_by_student_id(student_id_text)
    if not match:
        raise KeyError(student_id_text)
    return _profile_from(match, academic_repo.tree())


def _load_context(student_id_text: str):
    """One tree fetch, reused for the profile + class lookup."""
    match = students_repo.get_by_student_id(student_id_text)
    if not match:
        raise KeyError(student_id_text)
    tree = academic_repo.tree()
    profile = _profile_from(match, tree)
    cls = next((c for c in tree["classes"] if c["id"] == profile["class_id"]), None)
    return profile, cls


def _find_assignment(cls: dict | None, assignment_id: str):
    if not cls:
        return None
    for subj in cls["subjects"]:
        for topic in subj["topics"]:
            for asg in topic["assignments"]:
                if asg["id"] == assignment_id:
                    return {"assignment": asg, "subject": subj["name"], "topic": topic["name"]}
    return None


def _grade(questions: list[dict], answers: dict) -> dict:
    answers = answers or {}
    total = len(questions)
    max_score = sum(int(q.get("marks") or 0) for q in questions)
    score = 0
    earned = 0
    results = []
    for q in questions:
        chosen = answers.get(q["id"])
        correct = q.get("answer") or ""
        is_correct = bool(correct) and chosen == correct
        if is_correct:
            score += 1
            earned += int(q.get("marks") or 0)
        results.append(
            {
                "question_id": q["id"],
                "text": q["text"],
                "options": q["options"],
                "chosen": chosen,
                "answer": correct,
                "is_correct": is_correct,
                "marks": int(q.get("marks") or 0),
            }
        )
    percentage = round(earned / max_score * 100, 1) if max_score else 0.0
    return {
        "score": score,
        "total": total,
        "earned": earned,
        "max_score": max_score,
        "percentage": percentage,
        "results": results,
    }


def build_dashboard(student_id_text: str) -> dict:
    profile, cls = _load_context(student_id_text)

    attempts_by_assignment: dict[str, list] = {}
    for a in attempt_repo.list_for_student(profile["id"]):
        attempts_by_assignment.setdefault(a["assignment_id"], []).append(a)

    assignments = []
    if cls:
        for subj in cls["subjects"]:
            for topic in subj["topics"]:
                for asg in topic["assignments"]:
                    atts = attempts_by_assignment.get(asg["id"], [])
                    best = max((float(x["percentage"]) for x in atts), default=None)
                    assignments.append(
                        {
                            "id": asg["id"],
                            "title": asg["title"],
                            "instructions": asg["instructions"],
                            "subject": subj["name"],
                            "topic": topic["name"],
                            "question_count": asg["question_count"],
                            "total_marks": asg.get("total_marks", 0),
                            "max_attempts": asg.get("max_attempts", 1),
                            "attempts_used": len(atts),
                            "attempts_left": max(0, asg.get("max_attempts", 1) - len(atts)),
                            "best_percentage": best,
                            "last_percentage": float(atts[-1]["percentage"]) if atts else None,
                        }
                    )

    assignments.sort(key=lambda a: (a["subject"].lower(), a["topic"].lower(), a["title"].lower()))
    attempted = [a for a in assignments if a["attempts_used"] > 0]
    avg = (
        round(sum(a["best_percentage"] for a in attempted) / len(attempted), 1)
        if attempted
        else None
    )

    return {
        "student": profile,
        "stats": {
            "total": len(assignments),
            "completed": len(attempted),
            "pending": len(assignments) - len(attempted),
            "average_percentage": avg,
        },
        "assignments": assignments,
    }


def get_assignment_view(assignment_id: str, student_id_text: str) -> dict:
    profile, cls = _load_context(student_id_text)
    located = _find_assignment(cls, assignment_id)
    if not located:
        raise KeyError(assignment_id)

    full = academic_repo.get_assignment(assignment_id)
    questions = full["questions"]
    max_attempts = full.get("max_attempts", 1)
    atts = attempt_repo.list_for(profile["id"], assignment_id)

    last_result = None
    if atts:
        last = atts[-1]
        graded = _grade(questions, last.get("answers") or {})
        last_result = {
            **graded,
            "attempt_no": last["attempt_no"],
            "submitted_at": last.get("submitted_at"),
        }

    return {
        "assignment": {
            "id": full["id"],
            "title": full["title"],
            "instructions": full.get("instructions", ""),
            "subject": located["subject"],
            "topic": located["topic"],
            "max_attempts": max_attempts,
            "total_marks": sum(int(q.get("marks") or 0) for q in questions),
        },
        "questions": [
            {"id": q["id"], "text": q["text"], "options": q["options"], "marks": q["marks"]}
            for q in questions
        ],
        "attempts_used": len(atts),
        "attempts_left": max(0, max_attempts - len(atts)),
        "can_attempt": len(atts) < max_attempts,
        "history": [
            {
                "attempt_no": a["attempt_no"],
                "percentage": float(a["percentage"]),
                "score": a["score"],
                "total": a["total"],
                "submitted_at": a.get("submitted_at"),
            }
            for a in atts
        ],
        "last_result": last_result,
    }


def submit_attempt(assignment_id: str, student_id_text: str, answers: dict) -> dict:
    profile, cls = _load_context(student_id_text)
    if not _find_assignment(cls, assignment_id):
        raise KeyError(assignment_id)

    full = academic_repo.get_assignment(assignment_id)
    max_attempts = full.get("max_attempts", 1)
    prev = attempt_repo.list_for(profile["id"], assignment_id)
    if len(prev) >= max_attempts:
        raise PermissionError("You have used all your attempts for this assignment.")

    graded = _grade(full["questions"], answers)
    attempt_no = len(prev) + 1
    attempt_repo.add(
        {
            "assignment_id": assignment_id,
            "student_id": profile["id"],
            "attempt_no": attempt_no,
            "answers": answers or {},
            "score": graded["score"],
            "total": graded["total"],
            "earned": graded["earned"],
            "max_score": graded["max_score"],
            "percentage": graded["percentage"],
        }
    )
    return {
        **graded,
        "attempt_no": attempt_no,
        "attempts_left": max(0, max_attempts - attempt_no),
        "max_attempts": max_attempts,
    }


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #

router = APIRouter(prefix="/api/portal", tags=["portal"])


class AttemptBody(BaseModel):
    student_id: str
    answers: dict[str, str]


@router.get("/login/{student_id}")
def portal_login(student_id: str):
    try:
        return {"student": resolve_student(student_id)}
    except KeyError:
        raise HTTPException(status_code=404, detail="No student found with that ID.")


@router.get("/dashboard")
def portal_dashboard(student_id: str):
    try:
        return build_dashboard(student_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="No student found with that ID.")


@router.get("/assignments/{assignment_id}")
def portal_assignment(assignment_id: str, student_id: str):
    try:
        return get_assignment_view(assignment_id, student_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="This assignment is not available for you.")


@router.post("/assignments/{assignment_id}/attempt")
def portal_submit(assignment_id: str, body: AttemptBody):
    try:
        return submit_attempt(assignment_id, body.student_id, body.answers)
    except KeyError:
        raise HTTPException(status_code=404, detail="This assignment is not available for you.")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
