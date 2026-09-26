import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { fetchPortalAssignment, submitPortalAttempt } from "../api.js";
import { Card } from "../components/ui.jsx";
import { useStudentAuth } from "../studentAuth.jsx";

function ScoreBanner({ result }) {
  const pct = Math.round(result.percentage);
  return (
    <div className={`score-banner ${pct >= 40 ? "score-banner--ok" : "score-banner--low"}`}>
      <div className="score-banner__pct">{pct}%</div>
      <div className="score-banner__detail">
        <div>
          <b>{result.score}</b> / {result.total} correct
        </div>
        <div>
          <b>{result.earned}</b> / {result.max_score} marks
        </div>
        {result.attempt_no ? <div>Attempt {result.attempt_no}</div> : null}
      </div>
    </div>
  );
}

function ReviewList({ results }) {
  return (
    <div className="q-list">
      {results.map((r, i) => (
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
                    {isAnswer && <span className="q-opt__tag">correct answer</span>}
                    {isChosen && !isAnswer && <span className="q-opt__tag">your answer</span>}
                  </li>
                );
              })}
            </ul>
            {!r.chosen && <div className="warn-badge">Not answered</div>}
          </div>
          <div className="q-card__side">
            <span className={`marks-badge ${r.is_correct ? "marks-badge--ok" : ""}`}>
              {r.is_correct ? `+${r.marks}` : "0"} / {r.marks}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TakeAssignment() {
  const { assignmentId } = useParams();
  const { student, loading: authLoading } = useStudentAuth();

  const [data, setData] = useState(undefined); // undefined = loading, null = not found
  const [mode, setMode] = useState("review"); // "review" | "take"
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!student) return;
    const { data: d } = await fetchPortalAssignment(assignmentId, student.student_id);
    setData(d ?? null);
    if (d) {
      if (d.last_result) {
        setResult(d.last_result);
        setMode("review");
      } else {
        setMode("take");
      }
    }
  }, [assignmentId, student]);

  useEffect(() => {
    load();
  }, [load]);

  if (authLoading) return <p className="page-sub">Loading…</p>;
  if (!student)
    return (
      <Navigate
        to={`/student?redirect=${encodeURIComponent(`/student/a/${assignmentId}`)}`}
        replace
      />
    );
  if (data === undefined) return <p className="page-sub">Loading assignment…</p>;

  if (data === null) {
    return (
      <div className="under-construction">
        <div className="uc-emoji">🔍</div>
        <h1 className="page-title">Assignment not available</h1>
        <p className="page-sub">It may not be set for your class.</p>
        <Link className="btn-primary" to="/student">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const a = data.assignment;
  const answeredCount = Object.keys(answers).length;

  const startTake = () => {
    setAnswers({});
    setResult(null);
    setError("");
    setMode("take");
  };

  const submit = async () => {
    if (answeredCount < data.questions.length) {
      const ok = window.confirm(
        `You've answered ${answeredCount} of ${data.questions.length} questions. Submit anyway?`
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await submitPortalAttempt(assignmentId, student.student_id, answers);
      setResult(res);
      setMode("review");
      await load(); // refresh attempt counts / history
    } catch (e) {
      setError(e.message || "Could not submit.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="breadcrumb">
        <Link to="/student">Dashboard</Link>
        <span>/</span>
        <span>{a.title}</span>
      </div>

      {error && <div className="offline-banner">{error}</div>}

      <Card>
        <h1 className="page-title" style={{ marginBottom: 2 }}>
          {a.title}
        </h1>
        <p className="page-sub" style={{ marginBottom: 8 }}>
          {a.subject} · {a.topic} · {data.questions.length} questions · {a.total_marks} marks
        </p>
        {a.instructions && <p className="muted-note">{a.instructions}</p>}
        <div className="attempt-meta">
          Attempts used: <b>{data.attempts_used}</b> / {a.max_attempts}
          {data.attempts_left > 0
            ? ` · ${data.attempts_left} left`
            : " · no attempts left"}
        </div>
      </Card>

      {mode === "review" && result && (
        <>
          <ScoreBanner result={result} />
          <Card title="Review" className="mt">
            <ReviewList results={result.results} />
          </Card>

          {data.history.length > 1 && (
            <Card title="Attempt history" className="mt">
              <div className="pick-list">
                {data.history.map((h) => (
                  <div className="pick-row pick-row--static" key={h.attempt_no}>
                    <div className="pick-row__body">
                      <div className="pick-row__name">Attempt {h.attempt_no}</div>
                      <div className="pick-row__meta">
                        {h.score}/{h.total} correct
                      </div>
                    </div>
                    <span className="score-pill">{Math.round(h.percentage)}%</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="settings-actions" style={{ marginTop: 18 }}>
            {data.attempts_left > 0 ? (
              <button className="btn-primary" onClick={startTake}>
                Retake ({data.attempts_left} left)
              </button>
            ) : (
              <span className="muted-note">You have used all attempts for this assignment.</span>
            )}
            <Link className="btn-ghost" to="/student">
              Back to dashboard
            </Link>
          </div>
        </>
      )}

      {mode === "take" && (
        <>
          <Card title={`Answer all ${data.questions.length} questions`} className="mt">
            <div className="q-list">
              {data.questions.map((q, i) => (
                <div className="q-card" key={q.id}>
                  <div className="q-card__num">{i + 1}</div>
                  <div className="q-card__body">
                    <div className="q-card__text">
                      {q.text}
                      <span className="dim"> ({q.marks} mark{q.marks !== 1 ? "s" : ""})</span>
                    </div>
                    <div className="take-opts">
                      {q.options.map((opt, j) => (
                        <label className="take-opt" key={j}>
                          <input
                            type="radio"
                            name={q.id}
                            checked={answers[q.id] === opt}
                            onChange={() => setAnswers((x) => ({ ...x, [q.id]: opt }))}
                          />
                          <span className="q-opt__letter">{String.fromCharCode(65 + j)}</span>
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="submit-bar">
            <span className="muted-note">
              {answeredCount} / {data.questions.length} answered
            </span>
            <div className="settings-actions" style={{ margin: 0 }}>
              {result && (
                <button
                  className="btn-ghost"
                  onClick={() => setMode("review")}
                  disabled={busy}
                >
                  Cancel
                </button>
              )}
              <button className="btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit assignment"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
