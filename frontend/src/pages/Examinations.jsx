import { useCallback, useEffect, useMemo, useState } from "react";
import {
  examExportUrl,
  fetchAcademicsTree,
  fetchExamAttempt,
  fetchExamResults,
} from "../api.js";
import { Card } from "../components/ui.jsx";

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? String(iso).slice(0, 16).replace("T", " ")
    : d.toLocaleString();
}

function ResultDetail({ attemptId }) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetchExamAttempt(attemptId).then(({ data }) => alive && setD(data ?? null));
    return () => {
      alive = false;
    };
  }, [attemptId]);

  if (d === undefined) return <p className="muted-note">Loading answers…</p>;
  if (d === null) return <p className="muted-note">Couldn&rsquo;t load this attempt.</p>;

  return (
    <div className="q-list" style={{ marginTop: 12 }}>
      {d.results.map((r, i) => (
        <div className="q-card" key={r.question_id}>
          <div className="q-card__num">{i + 1}</div>
          <div className="q-card__body">
            <div className="q-card__text">{r.text}</div>
            <ul className="q-opts">
              {r.options.map((opt, j) => {
                const isAnswer = opt === r.answer && r.answer;
                const isChosen = opt === r.chosen;
                return (
                  <li
                    key={j}
                    className={`q-opt ${isAnswer ? "is-correct" : ""} ${
                      isChosen && !isAnswer ? "is-wrong" : ""
                    }`}
                  >
                    <span className="q-opt__letter">{String.fromCharCode(65 + j)}</span>
                    {opt}
                    {isAnswer && <span className="q-opt__tag">correct</span>}
                    {isChosen && !isAnswer && <span className="q-opt__tag">chosen</span>}
                  </li>
                );
              })}
            </ul>
            {!r.chosen && <div className="warn-badge">Not answered</div>}
          </div>
          <div className="q-card__side">
            <span className={`marks-badge ${r.is_correct ? "marks-badge--ok" : ""}`}>
              {r.is_correct ? `+${r.marks}` : "0"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Examinations() {
  const [tree, setTree] = useState({ classes: [] });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [classId, setClassId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetchAcademicsTree().then(({ data }) => setTree(data || { classes: [] }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchExamResults(classId, assignmentId);
    setResults(data.results || []);
    setLoading(false);
  }, [classId, assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const classes = tree.classes || [];
  const assignmentsForClass = useMemo(() => {
    const src = classId
      ? classes.filter((c) => c.id === classId)
      : classes;
    const out = [];
    for (const c of src) {
      for (const s of c.subjects || []) {
        for (const t of s.topics || []) {
          for (const a of t.assignments || []) {
            out.push({ id: a.id, label: `${a.title} — ${s.name}` });
          }
        }
      }
    }
    return out;
  }, [classes, classId]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Examinations</h1>
          <p className="page-sub">
            Every student assignment attempt. Filter by class / assignment and
            export to Excel.
          </p>
        </div>
        <a
          className="btn-primary"
          href={examExportUrl(classId, assignmentId)}
          target="_blank"
          rel="noreferrer"
        >
          Export to Excel
        </a>
      </div>

      <Card>
        <div className="filter-bar">
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setAssignmentId("");
            }}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
          >
            <option value="">All assignments</option>
            {assignmentsForClass.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <span className="muted-note" style={{ alignSelf: "center" }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <p className="muted-note">Loading results…</p>
        ) : results.length === 0 ? (
          <p className="muted-note">No attempts match this filter yet.</p>
        ) : (
          <div className="result-list">
            {results.map((r) => {
              const open = expanded === r.attempt_id;
              const pct = Math.round(r.percentage);
              return (
                <div className="result-row" key={r.attempt_id}>
                  <div
                    className="result-row__head"
                    onClick={() => setExpanded(open ? null : r.attempt_id)}
                  >
                    <div className="result-row__main">
                      <div className="result-row__name">
                        {r.student_name}{" "}
                        <span className="dim">· {r.student_id || "no ID"}</span>
                      </div>
                      <div className="result-row__meta">
                        {r.class}
                        {r.section ? ` – ${r.section}` : ""} · {r.assignment}
                        <span className="dim">
                          {" "}
                          · {r.subject} / {r.topic} · attempt {r.attempt_no} ·{" "}
                          {fmt(r.submitted_at)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`score-pill ${
                        pct >= 40 ? "score-pill--ok" : "score-pill--low"
                      }`}
                    >
                      {r.score}/{r.total} · {pct}%
                    </span>
                    <span className="result-row__chev">{open ? "▾" : "▸"}</span>
                  </div>
                  {open && <ResultDetail attemptId={r.attempt_id} />}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
