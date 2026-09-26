import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addAssignment, deleteAssignment, fetchAcademicsTree } from "../api.js";
import { Card } from "../components/ui.jsx";

/* Class -> Subject -> Topic cascading picker + assignment fields */
function CreateAssignmentForm({ classes, onCreated }) {
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [attempts, setAttempts] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cls = classes.find((c) => c.id === classId) || null;
  const subjects = cls?.subjects || [];
  const subject = subjects.find((s) => s.id === subjectId) || null;
  const topics = subject?.topics || [];

  const submit = async (e) => {
    e.preventDefault();
    if (!topicId || !title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await addAssignment(
        topicId,
        title.trim(),
        instructions.trim(),
        Math.max(1, Number(attempts) || 1)
      );
      setTitle("");
      setInstructions("");
      setAttempts(1);
      onCreated();
    } catch (e2) {
      setError(e2.message || "Could not create the assignment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-form add-form--stack" onSubmit={submit}>
      <label className="field">
        <span>Class</span>
        <select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setSubjectId("");
            setTopicId("");
          }}
        >
          <option value="">Select class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Subject</span>
        <select
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setTopicId("");
          }}
          disabled={!classId}
        >
          <option value="">Select subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Topic</span>
        <select
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          disabled={!subjectId}
        >
          <option value="">Select topic…</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Assignment title — e.g. Polynomials — Quiz 1"
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Instructions for students (optional)"
      />
      <label className="field field--inline">
        <span>Attempts allowed</span>
        <input
          type="number"
          min="1"
          max="20"
          value={attempts}
          onChange={(e) => setAttempts(e.target.value)}
        />
      </label>
      {error && <div className="form-error">{error}</div>}
      <button className="btn-primary" disabled={busy || !topicId || !title.trim()}>
        {busy ? "Creating…" : "Create assignment"}
      </button>
    </form>
  );
}

export default function AssignmentsManager() {
  const [tree, setTree] = useState({ classes: [] });
  const [classFilter, setClassFilter] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchAcademicsTree();
    setTree(data || { classes: [] });
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const classes = tree.classes || [];

  const rows = useMemo(() => {
    const out = [];
    for (const c of classes) {
      if (classFilter && c.id !== classFilter) continue;
      for (const s of c.subjects || []) {
        for (const t of s.topics || []) {
          for (const a of t.assignments || []) {
            out.push({
              id: a.id,
              class: c.name,
              subject: s.name,
              topic: t.name,
              title: a.title,
              question_count: a.question_count,
              total_marks: a.total_marks,
              max_attempts: a.max_attempts,
            });
          }
        }
      }
    }
    const q = query.trim().toLowerCase();
    const filtered = q
      ? out.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.subject.toLowerCase().includes(q) ||
            r.topic.toLowerCase().includes(q)
        )
      : out;
    return filtered.sort((a, b) =>
      (a.class + a.subject + a.topic + a.title).localeCompare(
        b.class + b.subject + b.topic + b.title
      )
    );
  }, [classes, classFilter, query]);

  const remove = async (a) => {
    if (
      !window.confirm(
        `Delete assignment "${a.title}"? This also deletes its questions and any student attempts.`
      )
    )
      return;
    await deleteAssignment(a.id);
    await reload();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Assignments Manager</h1>
          <p className="page-sub">
            Create or delete any assignment across every class, and jump
            straight into managing its questions — no need to drill through
            Classes &amp; Sections.
          </p>
        </div>
      </div>

      <div className="grid">
        <div className="col-4">
          <Card title="Create assignment">
            {loading ? (
              <p className="muted-note">Loading…</p>
            ) : classes.length === 0 ? (
              <p className="muted-note">
                Add a class, subject and topic first, on the Classes &amp;
                Sections page.
              </p>
            ) : (
              <CreateAssignmentForm classes={classes} onCreated={reload} />
            )}
          </Card>
        </div>

        <div className="col-8">
          <Card title={`All assignments (${rows.length})`}>
            <div className="filter-bar">
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, subject or topic…"
              />
            </div>

            {loading ? (
              <p className="muted-note">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="muted-note">No assignments match this filter.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Subject / Topic</th>
                      <th>Assignment</th>
                      <th>Questions</th>
                      <th>Attempts</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td>{a.class}</td>
                        <td>
                          {a.subject}
                          <span className="dim"> · {a.topic}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{a.title}</td>
                        <td>
                          {a.question_count} · {a.total_marks} m
                        </td>
                        <td>{a.max_attempts}</td>
                        <td style={{ textAlign: "right" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              justifyContent: "flex-end",
                              flexWrap: "wrap",
                            }}
                          >
                            <Link
                              className="btn-ghost btn-ghost--sm"
                              to={`/admin/academics/a/${a.id}`}
                            >
                              Manage
                            </Link>
                            <button
                              className="btn-ghost btn-ghost--sm btn-ghost--danger"
                              onClick={() => remove(a)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
