"""Parse uploaded .docx / .xlsx files into MCQ question dicts.

Output shape per question:
    {"text": str, "options": [str, ...], "answer": str, "marks": int}

`answer` is the exact text of the correct option (or "" if it could not be
resolved — the row is still imported and flagged as a warning).

Two .docx layouts are supported:

1. **School paper layout** (e.g. "Class VIII – Force"):
   - each question is a numbered paragraph:      `1. Force is best defined as a:`
   - its options are the cells of the table right after it:
       | A. Push or pull      | B. Type of energy |
       | C. Form of matter    | D. Unit of mass   |
   - correct answers come from an "Answer Key" table at the end:
       | Q.No. | Ans. | Q.No. | Ans. | ... |
       | 1     | A    | 11    | B    | ... |
     (an inline `Answer: C` line, or a bold correct option, also work)

2. **Inline layout**:
       1. Question text
       A) option one
       B) option two
       Answer: B
"""

from __future__ import annotations

import io
import re

# "A) foo"  "A. foo"  "(a) foo"  "A - foo"  "A: foo"
_OPTION_RE = re.compile(r"^\(?\s*([A-Ha-h])\s*[)\.\:\-]\s*(.+?)\s*$")
# "Answer: B"  "Ans - correct text"  "Correct Answer : Option C"
_ANSWER_RE = re.compile(
    r"^(?:ans(?:wer)?|correct(?:\s*answer)?|key)\s*[:\-]\s*(.+?)\s*$", re.I
)
# "1. question"  "Q2) question"  "Q.3 question"
_QNUM_RE = re.compile(r"^\s*(?:q(?:uestion)?[\s.)]*)?(\d{1,3})[).]\s+(.+)$", re.I)
# a "12 - B" / "12) b" / "12 . C" style answer-key pair inside free text
_KEYPAIR_RE = re.compile(r"\b(\d{1,3})\s*[-–.:) ]\s*([A-Ha-h])\b")


def _letter_from(raw: str, letters: list[str], option_texts: list[str]) -> str:
    """Turn an answer token ('B', 'b)', 'Option C', full text …) into option text."""
    if not raw:
        return ""
    a = str(raw).strip()
    if len(a) == 1 and a.upper() in letters:
        return option_texts[letters.index(a.upper())]
    m = re.match(r"^\(?([A-Ha-h])[)\.\:\-]?\s*(.*)$", a)
    if m and m.group(1).upper() in letters and (not m.group(2) or len(a) <= 3):
        return option_texts[letters.index(m.group(1).upper())]
    for t in option_texts:
        if t.strip().lower() == a.lower():
            return t
    return a  # keep raw; clean_parsed() decides whether to keep it


# --------------------------------------------------------------------------- #
# .docx
# --------------------------------------------------------------------------- #

def _iter_blocks(doc):
    """Yield ('p', paragraph, None) / ('t', None, table) in document order."""
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield "p", Paragraph(child, doc), None
        elif child.tag == qn("w:tbl"):
            yield "t", None, Table(child, doc)


def _cell_options(table):
    """Return ([(letter, text), ...], bold_letter | None) for an options table."""
    opts: list[tuple[str, str]] = []
    bold_letters: list[str] = []
    for row in table.rows:
        for cell in row.cells:
            text = cell.text.strip()
            if not text:
                continue
            m = _OPTION_RE.match(text)
            if not m:
                continue
            letter, body = m.group(1).upper(), m.group(2).strip()
            if any(letter == existing for existing, _ in opts):
                continue  # merged cells repeat the same text
            opts.append((letter, body))
            runs = [r for p in cell.paragraphs for r in p.runs if r.text.strip()]
            if runs and all(r.bold for r in runs):
                bold_letters.append(letter)
    bold = bold_letters[0] if len(bold_letters) == 1 else None
    return opts, bold


def _looks_like_options_table(table) -> bool:
    cells = [c.text.strip() for row in table.rows for c in row.cells]
    nonempty = [c for c in cells if c]
    matches = [c for c in nonempty if _OPTION_RE.match(c)]
    return len(matches) >= 2 and len(matches) >= len(nonempty) / 2


def _answer_key_from_table(table) -> dict[int, str]:
    """Read a 'Q.No./Ans.' style key table -> {question_number: letter}."""
    flat = [c.text.strip() for row in table.rows for c in row.cells]
    joined = " ".join(flat).lower()
    if "ans" not in joined or ("q.no" not in joined and "q no" not in joined and "question" not in joined):
        return {}
    key: dict[int, str] = {}
    for row in table.rows:
        cells = [c.text.strip() for c in row.cells]
        for j in range(len(cells) - 1):
            a, b = cells[j], cells[j + 1]
            if re.fullmatch(r"\d{1,3}", a) and re.fullmatch(r"[A-Ha-h]", b):
                key[int(a)] = b.upper()
    return key


def parse_docx(content: bytes) -> list[dict]:
    import docx  # python-docx

    doc = docx.Document(io.BytesIO(content))

    questions: dict[int, dict] = {}
    order: list[int] = []
    answer_key: dict[int, str] = {}
    current: int | None = None
    in_answer_section = False
    plain_lines: list[str] = []  # fallback for the inline layout

    for kind, para, table in _iter_blocks(doc):
        if kind == "p":
            line = para.text.strip()
            if not line:
                continue

            style = (getattr(para.style, "name", "") or "").lower()
            if re.search(r"answer\s*key", line, re.I):
                in_answer_section = True

            m_q = _QNUM_RE.match(line)
            if m_q:
                num = int(m_q.group(1))
                questions[num] = {"text": m_q.group(2).strip(), "options": []}
                if num not in order:
                    order.append(num)
                current = num
                plain_lines.append(line)
                continue

            m_ans = _ANSWER_RE.match(line)
            if m_ans and current is not None:
                answer_key.setdefault(current, m_ans.group(1).strip())
                plain_lines.append(line)
                continue

            m_opt = _OPTION_RE.match(line)
            if m_opt and current is not None:
                questions[current]["options"].append((m_opt.group(1).upper(), m_opt.group(2).strip()))
                plain_lines.append(line)
                continue

            if in_answer_section:
                for n, letter in _KEYPAIR_RE.findall(line):
                    answer_key.setdefault(int(n), letter.upper())

            if not style.startswith(("heading", "title")):
                plain_lines.append(line)

        else:  # table
            key = _answer_key_from_table(table)
            if key:
                answer_key.update(key)
                continue
            if current is not None and not questions[current]["options"] and _looks_like_options_table(table):
                opts, bold_letter = _cell_options(table)
                questions[current]["options"] = opts
                if bold_letter and current not in answer_key:
                    answer_key[current] = bold_letter

    structured = [n for n in order if questions[n]["options"]]
    if structured:
        out = []
        for num in order:
            q = questions[num]
            if not q["options"]:
                continue
            letters = [letter for letter, _ in q["options"]]
            texts = [text for _, text in q["options"]]
            answer = _letter_from(answer_key.get(num, ""), letters, texts)
            out.append({"text": q["text"], "options": texts, "answer": answer, "marks": 1})
        return out

    return _parse_lines(plain_lines)


# --------------------------------------------------------------------------- #
# inline-layout fallback
# --------------------------------------------------------------------------- #

def _parse_lines(lines: list[str]) -> list[dict]:
    questions: list[dict] = []
    cur: dict | None = None

    for line in lines:
        if not line:
            continue

        m_ans = _ANSWER_RE.match(line)
        if m_ans:
            if cur is not None:
                cur["answer_raw"] = m_ans.group(1)
            continue

        m_opt = _OPTION_RE.match(line)
        if m_opt and cur is not None and cur["text"]:
            cur["opts"].append((m_opt.group(1).upper(), m_opt.group(2).strip()))
            continue

        m_q = _QNUM_RE.match(line)
        if m_q:
            cur = {"text": m_q.group(2).strip(), "opts": [], "answer_raw": None}
            questions.append(cur)
            continue

        if cur is None or cur["opts"] or cur["answer_raw"]:
            cur = {"text": line, "opts": [], "answer_raw": None}
            questions.append(cur)
        else:
            cur["text"] = f"{cur['text']} {line}".strip()

    out = []
    for q in questions:
        letters = [letter for letter, _ in q["opts"]]
        texts = [text for _, text in q["opts"]]
        out.append(
            {
                "text": q["text"].strip(),
                "options": texts,
                "answer": _letter_from(q.get("answer_raw"), letters, texts),
                "marks": q.get("marks", 1),
            }
        )
    return out


# --------------------------------------------------------------------------- #
# .xlsx
# --------------------------------------------------------------------------- #

def parse_excel(content: bytes) -> list[dict]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]
    idx = {name: i for i, name in enumerate(header) if name}

    def col(row, *names) -> str:
        for n in names:
            if n in idx and idx[n] < len(row):
                v = row[idx[n]]
                if v is not None and str(v).strip():
                    return str(v).strip()
        return ""

    out: list[dict] = []
    for row in rows[1:]:
        if row is None or all(c is None or str(c).strip() == "" for c in row):
            continue

        text = col(row, "question", "question text", "prompt", "q")

        letter_opts: list[tuple[str, str]] = []
        for letter in "abcdef":
            v = col(row, f"option_{letter}", f"option {letter}", f"opt_{letter}", letter)
            if v:
                letter_opts.append((letter.upper(), v))

        if letter_opts:
            options = [v for _, v in letter_opts]
            letters = [letter for letter, _ in letter_opts]
        else:
            blob = col(row, "options", "choices")
            options = [p.strip() for p in re.split(r"[|;\n]", blob) if p.strip()]
            letters = [chr(65 + i) for i in range(len(options))]

        marks_raw = col(row, "marks", "mark", "points")
        try:
            marks = int(float(marks_raw)) if marks_raw else 1
        except ValueError:
            marks = 1

        answer = _letter_from(
            col(row, "answer", "correct", "correct answer", "ans", "key"), letters, options
        )
        out.append({"text": text, "options": options, "answer": answer, "marks": marks})

    return out


# --------------------------------------------------------------------------- #
# dispatch + validation
# --------------------------------------------------------------------------- #

def parse_upload(filename: str, content: bytes) -> list[dict]:
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        return parse_excel(content)
    if name.endswith(".docx"):
        return parse_docx(content)
    raise ValueError("Unsupported file type — upload a .docx or .xlsx file (.doc / .xls are not supported).")


def clean_parsed(parsed: list[dict]) -> tuple[list[dict], list[str]]:
    """Return (importable_questions, skipped_or_warning_messages)."""
    valid: list[dict] = []
    notes: list[str] = []
    for i, q in enumerate(parsed, 1):
        text = (q.get("text") or "").strip()
        options = [o.strip() for o in q.get("options", []) if o and o.strip()]
        if not text:
            notes.append(f"Item {i}: skipped — no question text")
            continue
        if len(options) < 2:
            notes.append(f"Item {i}: skipped — needs at least 2 options")
            continue
        answer = q.get("answer") or ""
        if answer not in options:
            notes.append(f"Item {i} (\"{text[:40]}…\"): imported without a correct answer")
            answer = ""
        marks = q.get("marks") or 1
        valid.append({"text": text, "options": options, "answer": answer, "marks": marks})
    return valid, notes
