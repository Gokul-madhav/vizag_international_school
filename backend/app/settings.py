"""App-wide feature switches, toggled from the admin Settings page.

Stored in Supabase (`app_settings` table, one row keyed `feature_flags`) when
academics is on Supabase, otherwise in process memory.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .academics import repo as academic_repo

# flag -> default (everything on by default)
FEATURE_DEFAULTS: dict[str, bool] = {
    "academics": True,
    "students": True,
    "assignments": True,
    "bulk_import": True,
    "student_portal": True,
    "activity_feed": True,
    "under_construction": True,
    "whatsapp_bot": True,
}

FEATURE_META: dict[str, dict] = {
    "academics": {
        "label": "Classes & Sections",
        "description": "Manage classes, sections, subjects and topics.",
    },
    "students": {
        "label": "Students",
        "description": "Add and manage student records and parent contacts.",
    },
    "assignments": {
        "label": "Assignments & Questions",
        "description": "Create assignments with MCQ questions under each topic.",
    },
    "bulk_import": {
        "label": "Bulk import from files",
        "description": "Upload .docx / .xlsx files to add questions or students in bulk.",
    },
    "student_portal": {
        "label": "Student portal",
        "description": "The student-facing dashboard at /student.",
    },
    "activity_feed": {
        "label": "Dashboard activity feed",
        "description": "The 'Recent Activity' panel on the admin dashboard.",
    },
    "under_construction": {
        "label": "Show ‘coming soon’ items",
        "description": "Show sidebar items for features not built yet (Teachers, Timetable, Fees, Announcements, Help Center).",
    },
    "whatsapp_bot": {
        "label": "WhatsApp test bot",
        "description": "Let students take tests via WhatsApp on the school's WhatsApp Business number. When off, the bot replies that testing is temporarily unavailable instead of starting a test.",
    },
}

_KEY = "feature_flags"


class FlagsIn(BaseModel):
    flags: dict[str, bool]


def _merge(stored: dict | None, updates: dict | None = None) -> dict:
    out = dict(FEATURE_DEFAULTS)
    for src in (stored or {}, updates or {}):
        for k, v in src.items():
            if k in FEATURE_DEFAULTS:
                out[k] = bool(v)
    return out


class MemorySettingsRepo:
    backend = "memory"

    def __init__(self):
        self._flags = dict(FEATURE_DEFAULTS)

    def get(self) -> dict:
        return dict(self._flags)

    def set(self, flags: dict) -> dict:
        self._flags = _merge(self._flags, flags)
        return dict(self._flags)


class SupabaseSettingsRepo:
    backend = "supabase"

    def __init__(self, client):
        self.c = client

    def get(self) -> dict:
        rows = (
            self.c.table("app_settings").select("value").eq("key", _KEY).limit(1).execute().data
            or []
        )
        return _merge(rows[0]["value"] if rows else {})

    def set(self, flags: dict) -> dict:
        merged = _merge(self.get(), flags)
        self.c.table("app_settings").upsert({"key": _KEY, "value": merged}).execute()
        return merged


def _build_repo():
    if getattr(academic_repo, "backend", "") == "supabase":
        print("[settings] using Supabase backend")
        return SupabaseSettingsRepo(academic_repo.c)
    print("[settings] using in-memory store")
    return MemorySettingsRepo()


repo = _build_repo()

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings():
    try:
        return {"flags": repo.get(), "meta": FEATURE_META, "backend": repo.backend}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("")
def put_settings(body: FlagsIn):
    try:
        return {"flags": repo.set(body.flags), "meta": FEATURE_META, "backend": repo.backend}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc))
