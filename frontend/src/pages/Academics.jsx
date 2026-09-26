import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addAssignment,
  addClass,
  addSection,
  addSubject,
  addTopic,
  deleteAssignment,
  deleteClass,
  deleteSection,
  deleteSubject,
  deleteTopic,
  fetchAcademicsTree,
} from "../api.js";
import { Card } from "../components/ui.jsx";
import { useSettings } from "../settings.jsx";

/* Single text field + button */
function AddForm({ placeholder, cta = "Add", onAdd }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onAdd(name);
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-form" onSubmit={submit}>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
      <button className="btn-primary" disabled={busy || !value.trim()}>
        {busy ? "…" : cta}
      </button>
    </form>
  );
}

/* Assignment: title + optional instructions + attempts allowed */
function AssignmentForm({ onAdd }) {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [attempts, setAttempts] = useState(1);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd(title.trim(), instructions.trim(), Math.max(1, Number(attempts) || 1));
      setTitle("");
      setInstructions("");
      setAttempts(1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-form add-form--stack" onSubmit={submit}>
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
      <button className="btn-primary" disabled={busy || !title.trim()}>
        {busy ? "…" : "Add assignment"}
      </button>
    </form>
  );
}

export default function Academics() {
  const { flags } = useSettings();
  const [tree, setTree] = useState(null);
  const [backend, setBackend] = useState("offline");
  const [error, setError] = useState("");
  const [activeClassId, setActiveClassId] = useState(null);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [activeTopicId, setActiveTopicId] = useState(null);

  const reload = useCallback(async () => {
    const { data } = await fetchAcademicsTree();
    setTree(data);
    setBackend(data.backend || "offline");
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Drop selections that no longer exist after a reload.
  useEffect(() => {
    if (!tree) return;
    const classes = tree.classes || [];
    const cls = classes.find((c) => c.id === activeClassId);
    if (activeClassId && !cls) {
      setActiveClassId(null);
      setActiveSubjectId(null);
      setActiveTopicId(null);
      return;
    }
    const subj = cls?.subjects.find((s) => s.id === activeSubjectId);
    if (activeSubjectId && !subj) {
      setActiveSubjectId(null);
      setActiveTopicId(null);
      return;
    }
    if (activeTopicId && subj && !subj.topics.some((t) => t.id === activeTopicId)) {
      setActiveTopicId(null);
    }
  }, [tree, activeClassId, activeSubjectId, activeTopicId]);

  const run = async (fn) => {
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e.message || "Something went wrong");
    }
  };

  if (!tree) return <p className="page-sub">Loading academic structure…</p>;

  const classes = tree.classes || [];
  const activeClass = classes.find((c) => c.id === activeClassId) || null;
  const activeSubject = activeClass?.subjects.find((s) => s.id === activeSubjectId) || null;
  const activeTopic = activeSubject?.topics.find((t) => t.id === activeTopicId) || null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Classes &amp; Sections</h1>
          <p className="page-sub">
            Add classes, their sections, the subjects in each class, the topics
            under each subject, and assignments (with questions) under each topic.
          </p>
        </div>
        <span className={`backend-badge ${backend === "supabase" ? "is-live" : ""}`}>
          {backend === "supabase"
            ? "Supabase connected"
            : backend === "memory"
            ? "In-memory store (no DB configured)"
            : "Backend offline"}
        </span>
      </div>

      {error && <div className="offline-banner">{error}</div>}

      <div className="grid">
        {/* ---- Classes column ------------------------------------------ */}
        <div className="col-4">
          <Card title={`Classes (${classes.length})`}>
            <AddForm
              placeholder="e.g. Grade IX"
              cta="Add class"
              onAdd={(name) => run(() => addClass(name))}
            />
            <div className="pick-list">
              {classes.length === 0 && (
                <p className="muted-note">No classes yet — add one above.</p>
              )}
              {classes.map((c) => (
                <div
                  key={c.id}
                  className={`pick-row ${c.id === activeClassId ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveClassId(c.id);
                    setActiveSubjectId(null);
                    setActiveTopicId(null);
                  }}
                >
                  <div className="pick-row__body">
                    <div className="pick-row__name">{c.name}</div>
                    <div className="pick-row__meta">
                      {c.sections.length} section{c.sections.length !== 1 ? "s" : ""} ·{" "}
                      {c.subjects.length} subject{c.subjects.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    className="icon-x"
                    title="Delete class"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete "${c.name}" and everything under it?`)) {
                        run(() => deleteClass(c.id));
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ---- Detail column ----------------------------------------- */}
        <div className="col-8">
          {!activeClass ? (
            <Card>
              <div className="empty-state">
                <div className="empty-state__icon">📚</div>
                <p>Select a class on the left to manage its sections, subjects and topics.</p>
              </div>
            </Card>
          ) : (
            <>
              <Card title={`Sections in ${activeClass.name}`}>
                <AddForm
                  placeholder="e.g. A"
                  cta="Add section"
                  onAdd={(name) => run(() => addSection(activeClass.id, name))}
                />
                <div className="chips">
                  {activeClass.sections.length === 0 && (
                    <span className="muted-note">No sections yet.</span>
                  )}
                  {activeClass.sections.map((s) => (
                    <span className="chip" key={s.id}>
                      {activeClass.name} – {s.name}
                      <button
                        className="icon-x"
                        title="Remove section"
                        onClick={() => run(() => deleteSection(s.id))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </Card>

              <Card title={`Subjects in ${activeClass.name}`} className="mt">
                <AddForm
                  placeholder="e.g. Mathematics"
                  cta="Add subject"
                  onAdd={(name) => run(() => addSubject(activeClass.id, name))}
                />
                <div className="pick-list">
                  {activeClass.subjects.length === 0 && (
                    <p className="muted-note">No subjects yet.</p>
                  )}
                  {activeClass.subjects.map((s) => (
                    <div
                      key={s.id}
                      className={`pick-row ${s.id === activeSubjectId ? "is-active" : ""}`}
                      onClick={() => {
                        setActiveSubjectId(s.id);
                        setActiveTopicId(null);
                      }}
                    >
                      <div className="pick-row__body">
                        <div className="pick-row__name">{s.name}</div>
                        <div className="pick-row__meta">
                          {s.topics.length} topic{s.topics.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <button
                        className="icon-x"
                        title="Delete subject"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete subject "${s.name}" and its topics?`)) {
                            run(() => deleteSubject(s.id));
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </Card>

              {activeSubject && (
                <Card title={`Topics in ${activeSubject.name}`} className="mt">
                  <AddForm
                    placeholder="Topic name — e.g. Polynomials"
                    cta="Add topic"
                    onAdd={(name) => run(() => addTopic(activeSubject.id, name))}
                  />
                  <div className="pick-list">
                    {activeSubject.topics.length === 0 && (
                      <p className="muted-note">No topics yet.</p>
                    )}
                    {activeSubject.topics.map((t) => (
                      <div
                        key={t.id}
                        className={`pick-row ${t.id === activeTopicId ? "is-active" : ""}`}
                        onClick={() => setActiveTopicId(t.id)}
                      >
                        <div className="pick-row__body">
                          <div className="pick-row__name">{t.name}</div>
                          <div className="pick-row__meta">
                            {t.description ? `${t.description} · ` : ""}
                            {t.assignments.length} assignment
                            {t.assignments.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <button
                          className="icon-x"
                          title="Delete topic"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete topic "${t.name}" and its assignments?`)) {
                              run(() => deleteTopic(t.id));
                            }
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {activeTopic && flags.assignments && (
                <Card title={`Assignments in ${activeTopic.name}`} className="mt">
                  <AssignmentForm
                    onAdd={(title, instructions, maxAttempts) =>
                      run(() =>
                        addAssignment(activeTopic.id, title, instructions, maxAttempts)
                      )
                    }
                  />
                  <div className="pick-list">
                    {activeTopic.assignments.length === 0 && (
                      <p className="muted-note">
                        No assignments yet. Add one, then open it to add questions
                        manually or by uploading a Word / Excel file.
                      </p>
                    )}
                    {activeTopic.assignments.map((a) => (
                      <div key={a.id} className="pick-row pick-row--static">
                        <div className="pick-row__body">
                          <div className="pick-row__name">{a.title}</div>
                          <div className="pick-row__meta">
                            {a.question_count} question
                            {a.question_count !== 1 ? "s" : ""}
                            {a.instructions ? ` · ${a.instructions}` : ""}
                          </div>
                        </div>
                        <Link className="btn-ghost" to={`/admin/academics/a/${a.id}`}>
                          Manage questions →
                        </Link>
                        <button
                          className="icon-x"
                          title="Delete assignment"
                          onClick={() => {
                            if (window.confirm(`Delete assignment "${a.title}"?`)) {
                              run(() => deleteAssignment(a.id));
                            }
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
