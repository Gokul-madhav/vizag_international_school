"""Student records: student id, name, class, section, parent name, parent phone.

Storage follows whatever the academics feature uses — Supabase if that is
configured, otherwise the same in-memory process store.
"""

from __future__ import annotations

import threading
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .academics import _guard  # reuse the KeyError -> 404 / Exception -> 400 wrapper
from .academics import repo as academic_repo
from .student_import import parse_students_upload


class StudentIn(BaseModel):
    student_id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    class_id: str = Field(min_length=1)
    section_id: str | None = None
    parent_name: str = Field(min_length=1, max_length=120)
    parent_phone: str = Field(min_length=3, max_length=32)


class StudentUpdate(StudentIn):
    pass


class PromoteIn(BaseModel):
    from_class_id: str = Field(min_length=1)
    to_class_id: str = Field(min_length=1)


def _promote(students_iter, set_row, from_class_id, to_class_id):
    """Shared promotion logic. `students_iter` yields (row_id, class_id, section_id),
    `set_row(row_id, new_class_id, new_section_id)` persists one change."""
    tree = academic_repo.tree()
    classes = {c["id"]: c for c in tree["classes"]}
    if from_class_id not in classes or to_class_id not in classes:
        raise KeyError("Class not found")

    src_section_name = {
        s["id"]: s["name"] for s in classes[from_class_id]["sections"]
    }
    dst_section_id = {
        s["name"].strip().lower(): s["id"] for s in classes[to_class_id]["sections"]
    }

    moved = 0
    for row_id, class_id, section_id in students_iter:
        if class_id != from_class_id:
            continue
        old_name = src_section_name.get(section_id, "")
        new_section = dst_section_id.get(old_name.strip().lower()) if old_name else None
        set_row(row_id, to_class_id, new_section)
        moved += 1
    return moved


def _norm(data: dict) -> dict:
    out = dict(data)
    for k in ("student_id", "name", "parent_name", "parent_phone"):
        if isinstance(out.get(k), str):
            out[k] = out[k].strip()
    if not out.get("section_id"):
        out["section_id"] = None
    if not out.get("student_id"):
        out["student_id"] = None
    return out


class DuplicateStudentId(Exception):
    pass


# --------------------------------------------------------------------------- #
# Repositories
# --------------------------------------------------------------------------- #

class MemoryStudentRepo:
    backend = "memory"

    def __init__(self):
        self._lock = threading.RLock()
        self._students: dict[str, dict] = {}
        self._seed()

    def list(self) -> list[dict]:
        with self._lock:
            return sorted(
                (dict(s) for s in self._students.values()), key=lambda r: r["name"].lower()
            )

    def add(self, data: dict) -> dict:
        with self._lock:
            d = _norm(data)
            sid = d.get("student_id")
            if sid and any(s.get("student_id") == sid for s in self._students.values()):
                raise DuplicateStudentId(f"Student ID '{sid}' already exists")
            row = {"id": uuid.uuid4().hex, **d}
            self._students[row["id"]] = row
            return dict(row)

    def update(self, student_id: str, data: dict) -> dict:
        with self._lock:
            row = self._students.get(student_id)
            if not row:
                raise KeyError(student_id)
            d = _norm(data)
            sid = d.get("student_id")
            if sid and any(
                s.get("student_id") == sid and s["id"] != student_id
                for s in self._students.values()
            ):
                raise DuplicateStudentId(f"Student ID '{sid}' already exists")
            row.update(d)
            return dict(row)

    def delete(self, student_id: str) -> None:
        with self._lock:
            self._students.pop(student_id, None)

    def get_by_student_id(self, sid: str) -> dict | None:
        key = (sid or "").strip().lower()
        if not key:
            return None
        with self._lock:
            for s in self._students.values():
                if (s.get("student_id") or "").strip().lower() == key:
                    return dict(s)
        return None

    def promote(self, from_class_id: str, to_class_id: str) -> int:
        with self._lock:
            rows = [
                (s["id"], s.get("class_id"), s.get("section_id"))
                for s in self._students.values()
            ]

            def set_row(row_id, new_class, new_section):
                r = self._students[row_id]
                r["class_id"] = new_class
                r["section_id"] = new_section

            return _promote(iter(rows), set_row, from_class_id, to_class_id)

    def _seed(self) -> None:
        try:
            if academic_repo.backend != "memory":
                return
            tree = academic_repo.tree()
            if not tree["classes"]:
                return
            c = tree["classes"][0]
            sec = c["sections"][0]["id"] if c["sections"] else None
            self.add({"student_id": "VIS-0001", "name": "Aarav Gupta", "class_id": c["id"],
                      "section_id": sec, "parent_name": "Rakesh Gupta", "parent_phone": "+91 90000 11111"})
            self.add({"student_id": "VIS-0002", "name": "Diya Nair", "class_id": c["id"],
                      "section_id": sec, "parent_name": "Suresh Nair", "parent_phone": "+91 90000 22222"})
        except Exception:  # noqa: BLE001 - seeding is best-effort
            pass


class SupabaseStudentRepo:
    backend = "supabase"

    def __init__(self, client):
        self.c = client

    def list(self) -> list[dict]:
        return self.c.table("students").select("*").order("name").execute().data or []

    def add(self, data: dict) -> dict:
        try:
            res = self.c.table("students").insert(_norm(data)).execute()
        except Exception as exc:  # noqa: BLE001
            if _is_dup(exc):
                raise DuplicateStudentId(
                    f"Student ID '{data.get('student_id')}' already exists"
                )
            raise
        rows = getattr(res, "data", None) or []
        if not rows:
            raise RuntimeError("Supabase returned no row")
        return rows[0]

    def update(self, student_id: str, data: dict) -> dict:
        try:
            res = self.c.table("students").update(_norm(data)).eq("id", student_id).execute()
        except Exception as exc:  # noqa: BLE001
            if _is_dup(exc):
                raise DuplicateStudentId(
                    f"Student ID '{data.get('student_id')}' already exists"
                )
            raise
        rows = getattr(res, "data", None) or []
        if not rows:
            raise KeyError(student_id)
        return rows[0]

    def delete(self, student_id: str) -> None:
        self.c.table("students").delete().eq("id", student_id).execute()

    def get_by_student_id(self, sid: str) -> dict | None:
        key = (sid or "").strip()
        if not key:
            return None
        rows = (
            self.c.table("students").select("*").ilike("student_id", key).limit(1).execute().data
            or []
        )
        return rows[0] if rows else None

    def promote(self, from_class_id: str, to_class_id: str) -> int:
        rows = (
            self.c.table("students")
            .select("id, class_id, section_id")
            .eq("class_id", from_class_id)
            .execute()
            .data
            or []
        )

        def set_row(row_id, new_class, new_section):
            self.c.table("students").update(
                {"class_id": new_class, "section_id": new_section}
            ).eq("id", row_id).execute()

        return _promote(
            ((r["id"], r.get("class_id"), r.get("section_id")) for r in rows),
            set_row,
            from_class_id,
            to_class_id,
        )


def _is_dup(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "23505" in msg or "duplicate key" in msg or "already exists" in msg


def _build_repo():
    if getattr(academic_repo, "backend", "") == "supabase":
        print("[students] using Supabase backend")
        return SupabaseStudentRepo(academic_repo.c)
    print("[students] using in-memory store")
    return MemoryStudentRepo()


repo = _build_repo()


# --------------------------------------------------------------------------- #
# Router
# --------------------------------------------------------------------------- #

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("")
def list_students():
    return {"students": _guard(repo.list), "backend": repo.backend}


@router.post("")
def create_student(body: StudentIn):
    try:
        return repo.add(body.model_dump())
    except DuplicateStudentId as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/{student_id}")
def update_student(student_id: str, body: StudentUpdate):
    try:
        return repo.update(student_id, body.model_dump())
    except KeyError:
        raise HTTPException(status_code=404, detail="Student not found")
    except DuplicateStudentId as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{student_id}")
def delete_student(student_id: str):
    _guard(repo.delete, student_id)
    return {"ok": True}


@router.post("/promote")
def promote_class(body: PromoteIn):
    if body.from_class_id == body.to_class_id:
        raise HTTPException(status_code=400, detail="Choose two different classes.")
    try:
        moved = repo.promote(body.from_class_id, body.to_class_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Class not found")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc))
    return {"moved": moved}


@router.post("/bulk")
async def bulk_upload_students(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    try:
        parsed = parse_students_upload(file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read the file: {exc}")

    tree = academic_repo.tree()
    classes_by_name = {c["name"].strip().lower(): c for c in tree["classes"]}
    created_classes: list[str] = []
    created_sections: list[str] = []
    notes: list[str] = []
    added = 0

    for i, row in enumerate(parsed, 1):
        name = (row.get("name") or "").strip()
        sid = (row.get("student_id") or "").strip()
        class_name = (row.get("class_name") or "").strip()
        section_name = (row.get("section_name") or "").strip()

        if not name:
            notes.append(f"Row {i}: skipped — no student name")
            continue
        if not class_name:
            notes.append(f"Row {i} ({name}): skipped — no class")
            continue

        key = class_name.lower()
        cls = classes_by_name.get(key)
        if cls is None:
            try:
                new = academic_repo.add_class(class_name)
            except Exception as exc:  # noqa: BLE001
                notes.append(f"Row {i} ({name}): couldn't create class '{class_name}' ({exc})")
                continue
            cls = {"id": new["id"], "name": new["name"], "sections": [], "subjects": []}
            classes_by_name[key] = cls
            created_classes.append(new["name"])

        section_id = None
        if section_name:
            sec = next(
                (s for s in cls["sections"] if s["name"].strip().lower() == section_name.lower()),
                None,
            )
            if sec is None:
                try:
                    newsec = academic_repo.add_section(cls["id"], section_name)
                    sec = {"id": newsec["id"], "name": newsec["name"]}
                    cls["sections"].append(sec)
                    created_sections.append(f'{cls["name"]} – {newsec["name"]}')
                except Exception as exc:  # noqa: BLE001
                    notes.append(
                        f"Row {i} ({name}): couldn't create section '{section_name}' ({exc})"
                    )
            if sec is not None:
                section_id = sec["id"]

        try:
            repo.add(
                {
                    "student_id": sid,
                    "name": name,
                    "class_id": cls["id"],
                    "section_id": section_id,
                    "parent_name": (row.get("parent_name") or "").strip(),
                    "parent_phone": (row.get("parent_phone") or "").strip(),
                }
            )
            added += 1
            if not sid:
                notes.append(f"Row {i} ({name}): added without a student ID")
        except DuplicateStudentId as exc:
            notes.append(f"Row {i} ({name}): skipped — {exc}")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"Row {i} ({name}): skipped — {exc}")

    return {
        "parsed": len(parsed),
        "added": added,
        "skipped": len(parsed) - added,
        "notes": notes,
        "createdClasses": created_classes,
        "createdSections": created_sections,
    }
