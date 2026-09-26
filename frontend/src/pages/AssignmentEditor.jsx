import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addQuestion,
  bulkUploadQuestions,
  deleteQuestion,
  fetchAssignment,
  updateAssignment,
  updateQuestion,
} from "../api.js";
import { Card } from "../components/ui.jsx";
import { useSettings } from "../settings.jsx";

const BLANK = { text: "", options: ["", ""], correctIndex: 0, marks: 1 };

/* Reusable add / edit question form */
function QuestionForm({ initial, submitLabel = "Add question", onSubmit, onCancel }) {
  const start =
    initial != null
      ? {
          text: initial.text,
          options: initial.options.length ? [...initial.options] : ["", ""],
          correctIndex: Math.max(0, initial.options.indexOf(initial.answer)),
          marks: initial.marks ?? 1,
        }
      : BLANK;

  const [text, setText] = useState(start.text);
  const [options, setOptions] = useState(start.options);
  const [correctIndex, setCorrectIndex] = useState(start.correctIndex);
  const [marks, setMarks] = useState(start.marks);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const setOption = (i, v) =>
    setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addOption = () => setOptions((o) => (o.length >= 8 ? o : [...o, ""]));
  const removeOption = (i) => {
    setOptions((o) => o.filter((_, idx) => idx !== i));
    setCorrectIndex((ci) => (ci === i ? 0 : ci > i ? ci - 1 : ci));
  };

  const submit = async (e) => {
    e.preventDefault();
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!text.trim()) return setErr("Question text is required.");
    if (cleaned.length < 2) return setErr("Add at least two non-empty options.");
    const answer = options[correctIndex]?.trim() || "";
    if (!answer || !cleaned.includes(answer))
      return setErr("Mark one option as the correct answer.");

    setErr("");
    setBusy(true);
    try {
      await onSubmit({
        text: text.trim(),
        options: cleaned,
        answer,
        marks: Number(marks) || 1,
      });
      if (initial == null) {
        setText("");
        setOptions(["", ""]);
        setCorrectIndex(0);
        setMarks(1);
      }
    } catch (e2) {
      setErr(e2.message || "Could not save the question.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="q-form" onSubmit={submit}>
      <label className="field">
        <span>Question</span>
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type the question…"
        />
      </label>

      <div className="field">
        <span>Options — select the correct one</span>
        <div className="option-editor">
          {options.map((opt, i) => (
            <div className="option-row" key={i}>
              <input
                type="radio"
                name="correct"
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                title="Mark as correct answer"
              />
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
              />
              <button
                type="button"
                className="icon-x"
                title="Remove option"
                disabled={options.length <= 2}
                onClick={() => removeOption(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {options.length < 8 && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={addOption}>
            + Add option
          </button>
        )}
      </div>

      <label className="field field--inline">
        <span>Marks</span>
        <input
          type="number"
          min="0"
          max="100"
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
        />
      </label>

      {err && <div className="form-error">{err}</div>}

      <div className="q-form__actions">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/* One question in the list, with inline edit */
function QuestionRow({ index, q, onSaved, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="q-card q-card--editing">
        <QuestionForm
          initial={q}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            await updateQuestion(q.id, payload);
            setEditing(false);
            onSaved();
          }}
        />
      </div>
    );
  }

  return (
    <div className="q-card">
      <div className="q-card__num">{index + 1}</div>
      <div className="q-card__body">
        <div className="q-card__text">{q.text}</div>
        <ul className="q-opts">
          {q.options.map((opt, i) => (
            <li
              key={i}
              className={`q-opt ${opt === q.answer && q.answer ? "is-correct" : ""}`}
            >
              <span className="q-opt__letter">{String.fromCharCode(65 + i)}</span>
              {opt}
              {opt === q.answer && q.answer && <span className="q-opt__tick">✓</span>}
            </li>
          ))}
        </ul>
        {!q.answer && (
          <div className="warn-badge">⚠ No correct answer set — edit to fix</div>
        )}
      </div>
      <div className="q-card__side">
        <span className="marks-badge">
          {q.marks} mark{q.marks !== 1 ? "s" : ""}
        </span>
        <button className="btn-ghost btn-ghost--sm" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          className="btn-ghost btn-ghost--sm btn-ghost--danger"
          onClick={() => window.confirm("Delete this question?") && onDelete(q.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function AssignmentEditor() {
  const { flags } = useSettings();
  const { assignmentId } = useParams();
  const [data, setData] = useState(undefined); // undefined = loading, null = not found
  const [error, setError] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [instrDraft, setInstrDraft] = useState("");
  const [attemptsDraft, setAttemptsDraft] = useState(1);
  const [savingMeta, setSavingMeta] = useState(false);
  const [upload, setUpload] = useState({ busy: false, result: null, error: "" });
  const fileRef = useRef(null);

  const reload = useCallback(async () => {
    const { data: d } = await fetchAssignment(assignmentId);
    setData(d ?? null);
    if (d) {
      setTitleDraft(d.title);
      setInstrDraft(d.instructions || "");
      setAttemptsDraft(d.max_attempts || 1);
    }
  }, [assignmentId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (fn) => {
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e.message || "Something went wrong");
    }
  };

  const saveMeta = async () => {
    if (!titleDraft.trim()) return;
    setSavingMeta(true);
    try {
      await updateAssignment(
        assignmentId,
        titleDraft.trim(),
        instrDraft.trim(),
        Math.max(1, Number(attemptsDraft) || 1)
      );
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingMeta(false);
    }
  };

  const doUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUpload({ busy: true, result: null, error: "" });
    try {
      const result = await bulkUploadQuestions(assignmentId, file);
      setUpload({ busy: false, result, error: "" });
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (e) {
      setUpload({ busy: false, result: null, error: e.message || "Upload failed" });
    }
  };

  if (data === undefined) return <p className="page-sub">Loading assignment…</p>;

  if (data === null) {
    return (
      <div className="under-construction">
        <div className="uc-emoji">🔍</div>
        <h1 className="page-title">Assignment not found</h1>
        <p className="page-sub">
          It may have been deleted, or the backend isn&rsquo;t running.
        </p>
        <Link className="btn-primary" to="/admin/academics">
          Back to Classes &amp; Sections
        </Link>
      </div>
    );
  }

  const totalMarks = data.questions.reduce((s, q) => s + (q.marks || 0), 0);
  const metaDirty =
    titleDraft.trim() !== data.title ||
    instrDraft.trim() !== (data.instructions || "") ||
    Number(attemptsDraft) !== (data.max_attempts || 1);

  return (
    <>
      <div className="breadcrumb">
        <Link to="/admin/academics">Classes &amp; Sections</Link>
        {data.subject && (
          <>
            <span>/</span>
            <span>{data.subject}</span>
          </>
        )}
        {data.topic && (
          <>
            <span>/</span>
            <span>{data.topic}</span>
          </>
        )}
        <span>/</span>
        <span>{data.title}</span>
      </div>

      {error && <div className="offline-banner">{error}</div>}

      <Card className="assignment-head">
        {(data.subject || data.topic) && (
          <p className="page-sub" style={{ margin: 0 }}>
            {[data.subject, data.topic].filter(Boolean).join(" · ")}
          </p>
        )}
        <label className="field">
          <span>Assignment title</span>
          <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
        </label>
        <label className="field">
          <span>Instructions for students</span>
          <textarea
            rows={2}
            value={instrDraft}
            onChange={(e) => setInstrDraft(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="field field--inline">
          <span>Attempts allowed for students</span>
          <input
            type="number"
            min="1"
            max="20"
            value={attemptsDraft}
            onChange={(e) => setAttemptsDraft(e.target.value)}
          />
        </label>
        <div className="assignment-head__foot">
          <div className="assignment-stats">
            <b>{data.questions.length}</b> question
            {data.questions.length !== 1 ? "s" : ""} · <b>{totalMarks}</b> total marks
          </div>
          <button
            className="btn-primary"
            disabled={!metaDirty || savingMeta || !titleDraft.trim()}
            onClick={saveMeta}
          >
            {savingMeta ? "Saving…" : "Save details"}
          </button>
        </div>
      </Card>

      <div className="grid">
        <div className={flags.bulk_import ? "col-7" : "col-12"}>
          <Card title="Add a question">
            <QuestionForm
              onSubmit={(payload) => run(() => addQuestion(assignmentId, payload))}
            />
          </Card>
        </div>

        {flags.bulk_import && (
        <div className="col-5">
          <Card title="Bulk add from a file">
            <p className="muted-note">
              Upload a <strong>.docx</strong> or <strong>.xlsx</strong> file and every
              question in it is added automatically.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.xlsx,.xlsm"
              className="file-input"
              onChange={() => setUpload((u) => ({ ...u, result: null, error: "" }))}
            />
            <button className="btn-primary" onClick={doUpload} disabled={upload.busy}>
              {upload.busy ? "Uploading…" : "Upload & import"}
            </button>

            {upload.error && <div className="form-error">{upload.error}</div>}
            {upload.result && (
              <div className="upload-result">
                <b>{upload.result.added}</b> added
                {upload.result.skipped > 0 && (
                  <>
                    {" "}
                    · <b>{upload.result.skipped}</b> skipped
                  </>
                )}
                {upload.result.notes?.length > 0 && (
                  <ul>
                    {upload.result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <details className="fmt-help">
              <summary>Expected file formats</summary>
              <p>
                <strong>Excel (.xlsx)</strong> — first row is a header. Columns:{" "}
                <code>question</code>, <code>option_a</code>, <code>option_b</code>,{" "}
                <code>option_c</code>, <code>option_d</code>, <code>answer</code>,{" "}
                <code>marks</code>. <code>answer</code> can be a letter (A/B/C/D) or the
                full option text. A single <code>options</code> column separated by{" "}
                <code>|</code> also works.
              </p>
              <p>
                <strong>Word (.docx)</strong> — one question per block:
              </p>
              <pre>
{`1. The degree of 4x^3 + 2x + 7 is:
A) 1
B) 2
C) 3
D) 7
Answer: C`}
              </pre>
              <p>Sample files are in <code>backend/sample_uploads/</code>.</p>
            </details>
          </Card>
        </div>
        )}

        <div className="col-12">
          <Card title={`Questions (${data.questions.length})`}>
            {data.questions.length === 0 ? (
              <p className="muted-note">
                No questions yet — add one on the left or import a file.
              </p>
            ) : (
              <div className="q-list">
                {data.questions.map((q, i) => (
                  <QuestionRow
                    key={q.id}
                    index={i}
                    q={q}
                    onSaved={reload}
                    onDelete={(id) => run(() => deleteQuestion(id))}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
