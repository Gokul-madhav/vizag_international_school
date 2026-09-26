"""New-student enquiry leads.

A prospective student who isn't on the roster yet types "new" at student
sign-in, fills a short form (name, class, current school, previous exam %,
parent name/phone), and is registered on the spot as a real `students` row
(generated `student_id` like `NEW-A1B2C3`) — so they immediately drop into the
same graded portal flow as an enrolled student, continuing straight to the
assignment they clicked through from. The lead-only fields (current school,
previous %, which test link brought them in) live in `leads`, pointing back at
that student row.

The admin sees these under Admin -> New Students (`/admin/new-students`).
"""

from __future__ import annotations

import random
import string
import threading
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .academics import repo as academic_repo
from .reports import _context
from .students import DuplicateStudentId
from .students import repo as students_repo


class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    class_id: str = Field(min_length=1)
    current_school: str = Field(min_length=1, max_length=160)
    previous_percentage: float = Field(ge=0, le=100)
    parent_name: str = Field(min_length=1, max_length=120)
    parent_phone: str = Field(min_length=3, max_length=32)
    assignment_id: str | None = None


def _gen_student_id() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"NEW-{suffix}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# storage — just the lead-only fields, referencing the created student row
# --------------------------------------------------------------------------- #

class MemoryLeadRepo:
    backend = "memory"

    def __init__(self):
        self._lock = threading.RLock()
        self._rows: dict[str, dict] = {}

    def list_all(self) -> list[dict]:
        with self._lock:
            return sorted(
                (dict(r) for r in self._rows.values()), key=lambda r: r["created_at"], reverse=True
            )

    def add(self, data: dict) -> dict:
        with self._lock:
            row = {"id": uuid.uuid4().hex, "created_at": _now_iso(), **data}
            self._rows[row["id"]] = row
            return dict(row)


class SupabaseLeadRepo:
    backend = "supabase"

    def __init__(self, client):
        self.c = client

    def list_all(self) -> list[dict]:
        return (
            self.c.table("leads").select("*").order("created_at", desc=True).execute().data or []
        )

    def add(self, data: dict) -> dict:
        rows = self.c.table("leads").insert(data).execute().data or []
        return rows[0] if rows else {**data, "id": None, "created_at": _now_iso()}


lead_repo = (
    SupabaseLeadRepo(academic_repo.c)
    if getattr(academic_repo, "backend", "") == "supabase"
    else MemoryLeadRepo()
)


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #

router = APIRouter(prefix="/api/leads", tags=["leads"])


@router.post("")
def create_lead(body: LeadIn):
    tree = academic_repo.tree()
    if not any(c["id"] == body.class_id for c in tree["classes"]):
        raise HTTPException(status_code=404, detail="Class not found")

    student = None
    for _ in range(5):
        try:
            student = students_repo.add(
                {
                    "student_id": _gen_student_id(),
                    "name": body.name,
                    "class_id": body.class_id,
                    "section_id": None,
                    "parent_name": body.parent_name,
                    "parent_phone": body.parent_phone,
                }
            )
            break
        except DuplicateStudentId:
            continue
    if student is None:
        raise HTTPException(
            status_code=500, detail="Could not generate a unique student ID — please try again."
        )

    lead = lead_repo.add(
        {
            "student_id": student["id"],
            "current_school": body.current_school,
            "previous_percentage": body.previous_percentage,
            "assignment_id": body.assignment_id,
        }
    )
    return {"student_id": student.get("student_id"), "lead_id": lead.get("id")}


@router.get("")
def list_leads():
    ctx = _context()
    rows = []
    for lead in lead_repo.list_all():
        st = ctx["student_by_pk"].get(lead.get("student_id"))
        if not st:
            continue
        am = ctx["assignment_meta"].get(lead.get("assignment_id") or "")
        rows.append(
            {
                "id": lead.get("id"),
                "name": st["name"],
                "student_id": st.get("student_id") or "",
                "class_name": ctx["class_name"].get(st.get("class_id"), "—"),
                "current_school": lead.get("current_school") or "",
                "previous_percentage": lead.get("previous_percentage"),
                "parent_name": st.get("parent_name") or "",
                "parent_phone": st.get("parent_phone") or "",
                "assignment_title": am["title"] if am else None,
                "created_at": lead.get("created_at"),
            }
        )
    return {"leads": rows}
