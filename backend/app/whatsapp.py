"""WhatsApp bot — students take a test from any phone.

Flow (all state lives in `wa_sessions`, keyed by the messaging phone number):

    "hi"              -> ask for Student ID
    "VIS-0001"        -> interactive list of the class's pending assignments
    tap an assignment -> title + instructions + [Start] / [Cancel]
    tap Start         -> question 1 (options as an interactive list)
    tap an option     -> next question ... last question -> auto-submit

On submit the attempt is graded through `portal.submit_attempt` (same rules as
the web portal: `max_attempts` enforced, stored in `attempts`). The score is
echoed into the chat and *also* pushed to the student's `parent_phone` on record
via a pre-approved template message. The messaging number is never persisted to
the student record — the `wa_sessions` row is deleted once the test finishes.

Meta WhatsApp Cloud API. Configure via .env:

    WHATSAPP_TOKEN=              # permanent access token
    WHATSAPP_PHONE_NUMBER_ID=    # the "Phone number ID" from the WhatsApp app
    WHATSAPP_VERIFY_TOKEN=       # any string; must match the webhook config
    WHATSAPP_RESULT_TEMPLATE=test_result
    WHATSAPP_TEMPLATE_LANG=en
    WHATSAPP_GRAPH_VERSION=v21.0
    WHATSAPP_APP_SECRET=         # optional; enables X-Hub-Signature-256 checks
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Request, Response

from . import portal
from .academics import repo as academic_repo
from .settings import repo as settings_repo

# --------------------------------------------------------------------------- #
# config
# --------------------------------------------------------------------------- #

SESSION_TTL_SECONDS = 30 * 60
GREETINGS = {"hi", "hello", "hey", "start", "menu", "test", "begin", "hai", "namaste"}

# WhatsApp interactive-message limits (characters / counts)
_LIM_BODY = 4096
_LIM_HEADER = 60
_LIM_BUTTON = 20
_LIM_ROW_TITLE = 24
_LIM_ROW_DESC = 72
_MAX_ROWS = 10


def _cfg() -> dict:
    return {
        "token": os.getenv("WHATSAPP_TOKEN", "").strip(),
        "phone_id": os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip(),
        "verify": os.getenv("WHATSAPP_VERIFY_TOKEN", "").strip(),
        "template": os.getenv("WHATSAPP_RESULT_TEMPLATE", "test_result").strip(),
        "lang": os.getenv("WHATSAPP_TEMPLATE_LANG", "en").strip() or "en",
        "version": os.getenv("WHATSAPP_GRAPH_VERSION", "v21.0").strip() or "v21.0",
        "app_secret": os.getenv("WHATSAPP_APP_SECRET", "").strip(),
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clip(text: str, n: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def wa_msisdn(raw: str) -> str:
    """Normalise a stored phone string to the digits-only form Meta expects.

    "+91 90000 11111" -> "919000011111".  A bare 10-digit number is assumed to
    be Indian and gets a 91 prefix.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        digits = "91" + digits
    return digits


# --------------------------------------------------------------------------- #
# Cloud API client
# --------------------------------------------------------------------------- #

class WhatsAppClient:
    def __init__(self) -> None:
        self._log_prefix = "[whatsapp]"

    @property
    def configured(self) -> bool:
        c = _cfg()
        return bool(c["token"] and c["phone_id"])

    async def _post(self, payload: dict) -> None:
        c = _cfg()
        if not self.configured:
            print(f"{self._log_prefix} not configured; would send: {payload}")
            return
        url = f"https://graph.facebook.com/{c['version']}/{c['phone_id']}/messages"
        headers = {"Authorization": f"Bearer {c['token']}"}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, json=payload, headers=headers)
            if r.status_code >= 300:
                print(f"{self._log_prefix} send failed {r.status_code}: {r.text}")
        except Exception as exc:  # noqa: BLE001
            print(f"{self._log_prefix} send error: {exc!r}")

    async def send_text(self, to: str, body: str) -> None:
        await self._post(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"body": _clip(body, _LIM_BODY), "preview_url": False},
            }
        )

    async def send_buttons(self, to: str, body: str, buttons: list[tuple[str, str]]) -> None:
        """buttons = [(id, title), ...] — max 3, title <= 20 chars."""
        await self._post(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "interactive",
                "interactive": {
                    "type": "button",
                    "body": {"text": _clip(body, _LIM_BODY)},
                    "action": {
                        "buttons": [
                            {
                                "type": "reply",
                                "reply": {"id": bid, "title": _clip(title, _LIM_BUTTON)},
                            }
                            for bid, title in buttons[:3]
                        ]
                    },
                },
            }
        )

    async def send_list(
        self,
        to: str,
        body: str,
        button: str,
        rows: list[tuple[str, str, str]],
        header: str = "",
    ) -> None:
        """rows = [(id, title, description), ...] — max 10, title <= 24, desc <= 72."""
        section = {
            "title": _clip(header or "Options", _LIM_ROW_TITLE),
            "rows": [
                {
                    "id": rid,
                    "title": _clip(title, _LIM_ROW_TITLE),
                    "description": _clip(desc, _LIM_ROW_DESC),
                }
                for rid, title, desc in rows[:_MAX_ROWS]
            ],
        }
        interactive: dict = {
            "type": "list",
            "body": {"text": _clip(body, _LIM_BODY)},
            "action": {"button": _clip(button, _LIM_BUTTON), "sections": [section]},
        }
        if header:
            interactive["header"] = {"type": "text", "text": _clip(header, _LIM_HEADER)}
        await self._post(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "interactive",
                "interactive": interactive,
            }
        )

    async def send_template(self, to: str, name: str, params: list[str]) -> bool:
        c = _cfg()
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": name,
                "language": {"code": c["lang"]},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": str(p)} for p in params],
                    }
                ],
            },
        }
        if not self.configured:
            print(f"{self._log_prefix} not configured; would send template: {payload}")
            return False
        url = f"https://graph.facebook.com/{c['version']}/{c['phone_id']}/messages"
        headers = {"Authorization": f"Bearer {c['token']}"}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, json=payload, headers=headers)
            if r.status_code >= 300:
                print(f"{self._log_prefix} template send failed {r.status_code}: {r.text}")
                return False
            return True
        except Exception as exc:  # noqa: BLE001
            print(f"{self._log_prefix} template send error: {exc!r}")
            return False


wa = WhatsAppClient()


# --------------------------------------------------------------------------- #
# session storage (Supabase table `wa_sessions`, or in-memory)
# --------------------------------------------------------------------------- #

_BLANK = {
    "student_pk": None,
    "student_id": None,
    "state": "NEW",
    "assignment_id": None,
    "q_index": 0,
    "answers": {},
    "questions": [],
}


def _fresh(phone: str) -> dict:
    return {"phone": phone, **_BLANK, "updated_at": _now_iso()}


def _is_expired(row: dict) -> bool:
    try:
        ts = datetime.fromisoformat(str(row.get("updated_at")).replace("Z", "+00:00"))
    except ValueError:
        return True
    return (datetime.now(timezone.utc) - ts).total_seconds() > SESSION_TTL_SECONDS


class MemorySessionRepo:
    backend = "memory"

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._rows: dict[str, dict] = {}

    def get(self, phone: str) -> dict:
        with self._lock:
            row = self._rows.get(phone)
            if row and not _is_expired(row):
                return dict(row)
            self._rows.pop(phone, None)
            return _fresh(phone)

    def save(self, phone: str, **fields) -> None:
        with self._lock:
            row = self._rows.get(phone) or _fresh(phone)
            row.update(fields)
            row["updated_at"] = _now_iso()
            self._rows[phone] = row

    def clear(self, phone: str) -> None:
        with self._lock:
            self._rows.pop(phone, None)


class SupabaseSessionRepo:
    backend = "supabase"

    def __init__(self, client) -> None:
        self.c = client

    def get(self, phone: str) -> dict:
        rows = (
            self.c.table("wa_sessions").select("*").eq("phone", phone).limit(1).execute().data
            or []
        )
        if rows and not _is_expired(rows[0]):
            return rows[0]
        if rows:
            self.clear(phone)
        return _fresh(phone)

    def save(self, phone: str, **fields) -> None:
        row = {"phone": phone, **fields, "updated_at": _now_iso()}
        self.c.table("wa_sessions").upsert(row, on_conflict="phone").execute()

    def clear(self, phone: str) -> None:
        self.c.table("wa_sessions").delete().eq("phone", phone).execute()


session_repo = (
    SupabaseSessionRepo(academic_repo.c)
    if getattr(academic_repo, "backend", "") == "supabase"
    else MemorySessionRepo()
)


# de-dupe Meta's webhook redeliveries (bounded LRU of processed message ids)
_seen_ids: "OrderedDict[str, float]" = OrderedDict()
_seen_lock = threading.Lock()


def _already_processed(wamid: str) -> bool:
    if not wamid:
        return False
    with _seen_lock:
        if wamid in _seen_ids:
            return True
        _seen_ids[wamid] = time.time()
        while len(_seen_ids) > 500:
            _seen_ids.popitem(last=False)
    return False


# --------------------------------------------------------------------------- #
# conversation logic
# --------------------------------------------------------------------------- #

_LETTERS = "ABCDEFGH"


def _resolve_student(text: str) -> dict | None:
    """Full profile (name, class_name, section_name, parent_phone, ...) — the
    same shape the web portal uses, so the parent message can be detailed."""
    try:
        return portal.resolve_student((text or "").strip())
    except KeyError:
        return None


def _class_label(student: dict) -> str:
    cls = student.get("class_name") or "—"
    sec = student.get("section_name")
    return f"{cls} - {sec}" if sec else cls


def _pending_assignments(student_id_text: str) -> list[dict]:
    """Class assignments the student still has attempts left on."""
    dash = portal.build_dashboard(student_id_text)
    return [a for a in dash["assignments"] if a["attempts_left"] > 0]


async def _send_menu(phone: str, sess: dict) -> None:
    student_id_text = sess["student_id"]
    try:
        pending = _pending_assignments(student_id_text)
    except KeyError:
        await wa.send_text(phone, "Your Student ID is no longer on file. Send *hi* to start again.")
        session_repo.clear(phone)
        return

    if not pending:
        await wa.send_text(
            phone,
            "You have no pending tests right now. \U0001F389\nSend *hi* any time to check again.",
        )
        session_repo.clear(phone)
        return

    rows = [
        (
            a["id"],
            a["title"],
            f"{a['subject']} • {a['topic']} • {a['question_count']} Qs",
        )
        for a in pending
    ]
    note = "" if len(pending) <= _MAX_ROWS else f"\n\n(Showing the first {_MAX_ROWS}.)"
    session_repo.save(
        phone,
        student_pk=sess["student_pk"],
        student_id=student_id_text,
        state="MENU",
        assignment_id=None,
        q_index=0,
        answers={},
        questions=[],
    )
    await wa.send_list(
        phone,
        f"Hi! Pick a test to begin.{note}",
        button="Choose a test",
        rows=rows,
        header="Your tests",
    )


async def _send_assignment_intro(phone: str, sess: dict, assignment_id: str) -> None:
    try:
        view = portal.get_assignment_view(assignment_id, sess["student_id"])
    except KeyError:
        await wa.send_text(phone, "That test isn't available for you. Send *hi* to see the list again.")
        session_repo.clear(phone)
        return

    a = view["assignment"]
    if not view["can_attempt"]:
        await wa.send_text(phone, f"You've used all attempts for *{a['title']}*.")
        await _send_menu(phone, sess)
        return

    lines = [f"*{a['title']}*", f"{a['subject']} • {a['topic']}"]
    if a.get("instructions"):
        lines += ["", a["instructions"]]
    lines += [
        "",
        f"\U0001F4DD {len(view['questions'])} questions • {a['total_marks']} marks",
        f"\U0001F501 Attempts left: {view['attempts_left']} of {a['max_attempts']}",
    ]
    session_repo.save(
        phone,
        student_pk=sess["student_pk"],
        student_id=sess["student_id"],
        state="CONFIRM_START",
        assignment_id=assignment_id,
        q_index=0,
        answers={},
        questions=[],
    )
    await wa.send_buttons(
        phone,
        "\n".join(lines),
        [(f"start::{assignment_id}", "Start test"), ("cancel", "Cancel")],
    )


def _question_body(q: dict, idx: int, total: int) -> str:
    opts = "\n".join(f"{_LETTERS[i]}. {o}" for i, o in enumerate(q["options"]))
    marks = q.get("marks", 1)
    return f"*Question {idx + 1} of {total}*  ({marks} mark{'s' if marks != 1 else ''})\n\n{q['text']}\n\n{opts}"


async def _send_question(phone: str, sess: dict) -> None:
    questions = sess["questions"]
    idx = sess["q_index"]
    q = questions[idx]
    rows = [
        (f"ans::{idx}::{i}", f"{_LETTERS[i]}", o)
        for i, o in enumerate(q["options"])
    ]
    await wa.send_list(
        phone,
        _question_body(q, idx, len(questions)),
        button="Choose answer",
        rows=rows,
        header=f"Question {idx + 1}/{len(questions)}",
    )


async def _submit(phone: str, sess: dict) -> None:
    assignment_id = sess["assignment_id"]
    student_id_text = sess["student_id"]
    try:
        result = portal.submit_attempt(assignment_id, student_id_text, sess["answers"])
    except PermissionError as exc:
        await wa.send_text(phone, f"⚠️ {exc}")
        session_repo.clear(phone)
        return
    except KeyError:
        await wa.send_text(phone, "Couldn't submit — that test is no longer available.")
        session_repo.clear(phone)
        return

    student = _resolve_student(student_id_text) or {}
    assignment = {"title": "your test", "subject": "—", "topic": "—"}
    try:
        assignment = portal.get_assignment_view(assignment_id, student_id_text)["assignment"]
    except Exception:  # noqa: BLE001
        pass

    pct = result["percentage"]
    summary = (
        f"✅ *Test submitted!*\n\n"
        f"*{assignment['title']}*\n"
        f"{assignment['subject']} • {assignment['topic']}\n"
        f"Score: {result['earned']}/{result['max_score']}  ({pct}%)\n"
        f"Correct: {result['score']} of {result['total']}\n"
        f"Attempt {result['attempt_no']} of {result['max_attempts']} "
        f"• {result['attempts_left']} left"
    )
    await wa.send_text(phone, summary)

    review = _review_lines(result.get("results", []))
    if review:
        await wa.send_text(phone, review)

    # push the result to the parent's number on record (template — the parent
    # has not messaged us, so a free-form text is not allowed).
    parent_phone = (student.get("parent_phone") or "").strip()
    parent_to = wa_msisdn(parent_phone)
    if parent_to:
        c = _cfg()
        correct_str = f"{result['score']} out of {result['total']}"
        marks_str = f"{result['earned']} / {result['max_score']}"
        ok = await wa.send_template(
            parent_to,
            c["template"],
            [
                student.get("name", "Your child"),
                _class_label(student),
                assignment["subject"],
                assignment["topic"],
                assignment["title"],
                correct_str,
                marks_str,
                f"{pct}%",
            ],
        )
        if not ok and parent_to == phone:
            # same number the student used -> inside the 24h window, plain text is fine
            parent_summary = (
                f"📋 *Test Result — Vizag International School*\n\n"
                f"Student: *{student.get('name', '—')}*\n"
                f"Class: {_class_label(student)}\n"
                f"Subject: {assignment['subject']} • Topic: {assignment['topic']}\n"
                f"Test: *{assignment['title']}*\n\n"
                f"Correct answers: {correct_str}\n"
                f"Marks scored: {marks_str}\n"
                f"Percentage: {pct}%"
            )
            await wa.send_text(parent_to, parent_summary)

    session_repo.clear(phone)


def _review_lines(results: list[dict]) -> str:
    if not results:
        return ""
    out = ["*Review*"]
    for i, r in enumerate(results):
        mark = "✅" if r["is_correct"] else "❌"
        line = f"{mark} Q{i + 1}: {_clip(r['text'], 90)}"
        if not r["is_correct"]:
            line += f"\n   Your answer: {r.get('chosen') or '—'}\n   Correct: {r.get('answer') or '—'}"
        out.append(line)
    return _clip("\n".join(out), _LIM_BODY)


async def _advance(phone: str, kind: str, value: str) -> None:
    """kind = 'text' | 'reply'; value = message body or the tapped row/button id."""
    if not settings_repo.get().get("whatsapp_bot", True):
        await wa.send_text(
            phone,
            "WhatsApp test-taking is currently turned off by the school. "
            "Please check back later.",
        )
        return

    sess = session_repo.get(phone)
    state = sess["state"]
    low = (value or "").strip().lower()

    # global escapes
    if kind == "text" and low in {"cancel", "stop", "quit", "exit"}:
        session_repo.clear(phone)
        await wa.send_text(phone, "Okay, cancelled. Send *hi* whenever you want to take a test.")
        return
    if kind == "reply" and value == "cancel":
        if sess.get("student_id"):
            await wa.send_text(phone, "Cancelled.")
            await _send_menu(phone, sess)
        else:
            session_repo.clear(phone)
            await wa.send_text(phone, "Cancelled. Send *hi* to start again.")
        return
    if kind == "text" and low in GREETINGS and state in {"NEW", "AWAITING_ID"}:
        session_repo.save(phone, state="AWAITING_ID")
        await wa.send_text(
            phone,
            "\U0001F44B Welcome to *Vizag International School* tests.\n\n"
            "Reply with your *Student ID* (for example: VIS-0001) to begin.",
        )
        return

    # state machine
    if state in {"NEW", "AWAITING_ID"}:
        if kind != "text" or not low:
            session_repo.save(phone, state="AWAITING_ID")
            await wa.send_text(phone, "Please reply with your *Student ID* (e.g. VIS-0001).")
            return
        student = _resolve_student(value)
        if not student:
            await wa.send_text(
                phone,
                "I couldn't find a student with that ID. Please check it and send it again.",
            )
            return
        session_repo.save(
            phone,
            student_pk=student["id"],
            student_id=(student.get("student_id") or "").strip(),
            state="MENU",
        )
        await wa.send_text(phone, f"Thanks, {student['name'].split()[0]}! ✅")
        await _send_menu(phone, session_repo.get(phone))
        return

    if state == "MENU":
        if kind == "reply" and value and not value.startswith(("ans::", "start::")):
            await _send_assignment_intro(phone, sess, value)
        else:
            await _send_menu(phone, sess)
        return

    if state == "CONFIRM_START":
        if kind == "reply" and value.startswith("start::"):
            assignment_id = value.split("::", 1)[1]
            try:
                view = portal.get_assignment_view(assignment_id, sess["student_id"])
            except KeyError:
                await wa.send_text(phone, "That test isn't available. Send *hi* to try again.")
                session_repo.clear(phone)
                return
            if not view["can_attempt"]:
                await wa.send_text(phone, "You've used all attempts for this test.")
                await _send_menu(phone, sess)
                return
            session_repo.save(
                phone,
                state="IN_TEST",
                assignment_id=assignment_id,
                q_index=0,
                answers={},
                questions=view["questions"],
            )
            await _send_question(phone, session_repo.get(phone))
        else:
            await _send_assignment_intro(phone, sess, sess.get("assignment_id"))
        return

    if state == "IN_TEST":
        questions = sess["questions"]
        idx = sess["q_index"]
        if kind != "reply" or not value.startswith("ans::"):
            await wa.send_text(phone, "Tap an option from the list above to answer.")
            await _send_question(phone, sess)
            return
        try:
            _, q_str, opt_str = value.split("::")
            q_no, opt_no = int(q_str), int(opt_str)
        except ValueError:
            await _send_question(phone, sess)
            return
        if q_no != idx:  # a tap on an earlier question's list — ignore, re-show current
            await _send_question(phone, sess)
            return
        q = questions[idx]
        chosen = q["options"][opt_no] if 0 <= opt_no < len(q["options"]) else ""
        answers = dict(sess["answers"])
        answers[q["id"]] = chosen
        next_idx = idx + 1
        if next_idx >= len(questions):
            session_repo.save(phone, answers=answers, q_index=next_idx)
            await _submit(phone, session_repo.get(phone))
        else:
            session_repo.save(phone, answers=answers, q_index=next_idx)
            await _send_question(phone, session_repo.get(phone))
        return

    # unknown state -> reset
    session_repo.clear(phone)
    await wa.send_text(phone, "Let's start over. Send *hi* to take a test.")


# --------------------------------------------------------------------------- #
# webhook plumbing
# --------------------------------------------------------------------------- #

def _extract(value: dict) -> tuple[str, str, str, str] | None:
    """(phone, wamid, kind, payload) from a `messages` change, or None to skip."""
    messages = value.get("messages") or []
    if not messages:
        return None  # delivery/read status callbacks — nothing to do
    msg = messages[0]
    phone = msg.get("from") or ""
    wamid = msg.get("id") or ""
    mtype = msg.get("type")
    if mtype == "text":
        return phone, wamid, "text", (msg.get("text") or {}).get("body", "")
    if mtype == "interactive":
        inter = msg.get("interactive") or {}
        if inter.get("type") == "list_reply":
            return phone, wamid, "reply", (inter.get("list_reply") or {}).get("id", "")
        if inter.get("type") == "button_reply":
            return phone, wamid, "reply", (inter.get("button_reply") or {}).get("id", "")
    if mtype == "button":  # template quick-reply button
        return phone, wamid, "text", (msg.get("button") or {}).get("text", "")
    # images, audio, location, etc.
    return phone, wamid, "text", ""


async def _process(body: dict) -> None:
    try:
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                extracted = _extract(change.get("value") or {})
                if not extracted:
                    continue
                phone, wamid, kind, payload = extracted
                if not phone or _already_processed(wamid):
                    continue
                await _advance(phone, kind, payload)
    except Exception as exc:  # noqa: BLE001 — never let the webhook 500 on Meta
        print(f"[whatsapp] handler error: {exc!r}")


def _valid_signature(app_secret: str, raw: bytes, header: str) -> bool:
    if not header.startswith("sha256="):
        return False
    digest = hmac.new(app_secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, header.split("=", 1)[1])


router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


@router.get("/webhook")
def verify(request: Request):
    """Meta calls this once when you set the webhook URL."""
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == _cfg()["verify"]:
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    return Response(content="forbidden", status_code=403)


@router.post("/webhook")
async def incoming(request: Request, background: BackgroundTasks):
    raw = await request.body()
    c = _cfg()
    if c["app_secret"]:
        sig = request.headers.get("x-hub-signature-256", "")
        if not _valid_signature(c["app_secret"], raw, sig):
            return Response(content="bad signature", status_code=403)
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return Response(status_code=200)
    background.add_task(_process, body)
    return Response(status_code=200)  # ack fast; Meta retries on slow/failed replies


@router.get("/status")
def status():
    return {"configured": wa.configured, "sessions_backend": session_repo.backend}
