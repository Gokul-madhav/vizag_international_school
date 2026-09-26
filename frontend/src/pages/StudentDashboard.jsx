import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fetchPortalDashboard } from "../api.js";
import { Card, StatCard } from "../components/ui.jsx";
import BarChart from "../components/charts/BarChart.jsx";
import NewStudentForm from "../components/NewStudentForm.jsx";
import { useStudentAuth } from "../studentAuth.jsx";

function LoginScreen() {
  const { login } = useStudentAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = params.get("redirect") || "";
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    if (v.toLowerCase() === "new") {
      setShowNewForm(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(v);
      if (redirectTo) navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  if (showNewForm) {
    return <NewStudentForm redirectTo={redirectTo} onBack={() => setShowNewForm(false)} />;
  }

  return (
    <div className="login-wrap">
      <Card className="login-card">
        <div className="login-card__mark">🎓</div>
        <h2 className="login-card__title">Student sign in</h2>
        <p className="login-card__sub">
          Enter your Student ID to see your class assignments and results.
          First time here? Type <b>new</b> to register.
        </p>
        <form onSubmit={submit} className="q-form">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. VIS-0001, or 'new'"
          />
          <button className="btn-primary" disabled={busy || !value.trim()}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
        {error && <div className="form-error">{error}</div>}
      </Card>
    </div>
  );
}

export default function StudentDashboard() {
  const { student, loading, logout } = useStudentAuth();
  const [state, setState] = useState({ data: null, loading: true, offline: false });

  const reload = useCallback(async () => {
    if (!student) return;
    setState((s) => ({ ...s, loading: true }));
    const { data, offline } = await fetchPortalDashboard(student.student_id);
    setState({ data, offline, loading: false });
  }, [student]);

  useEffect(() => {
    reload();
  }, [reload]);

  const chartData = useMemo(() => {
    const rows = (state.data?.assignments || []).filter((a) => a.attempts_used > 0);
    return rows.map((a) => ({
      day: a.title.length > 8 ? `${a.title.slice(0, 8)}…` : a.title,
      current: Math.round(a.best_percentage ?? 0),
      previous: Math.round(a.last_percentage ?? 0),
    }));
  }, [state.data]);

  if (loading) return <p className="page-sub">Loading…</p>;
  if (!student) return <LoginScreen />;
  if (state.loading && !state.data) return <p className="page-sub">Loading your dashboard…</p>;

  const d = state.data;
  if (!d) {
    return (
      <div className="offline-banner">
        Couldn&rsquo;t load your dashboard. Is the backend running?{" "}
        <button className="btn-ghost btn-ghost--sm" onClick={reload}>
          Retry
        </button>
      </div>
    );
  }

  const s = d.student;
  const stats = d.stats;
  const todo = (d.assignments || []).filter((a) => a.attempts_used === 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Hi, {s.name.split(" ")[0]} 👋</h1>
          <p className="page-sub">
            {s.class_name}
            {s.section_name ? ` – ${s.section_name}` : ""} · Student ID {s.student_id}
          </p>
        </div>
        <button className="btn-ghost" onClick={logout}>
          Sign out
        </button>
      </div>

      {todo.length > 0 && (
        <Card
          className="todo-card"
          title={`To do — ${todo.length} assignment${todo.length !== 1 ? "s" : ""}`}
          subtitle="You haven't started these yet"
        >
          <div className="todo-list">
            {todo.map((a) => (
              <div className="todo-item" key={a.id}>
                <div className="todo-item__body">
                  <div className="todo-item__title">
                    {a.title} <span className="dim">· {a.topic}</span>
                  </div>
                  <div className="todo-item__meta">
                    {a.subject} · {a.question_count} question
                    {a.question_count !== 1 ? "s" : ""} · {a.total_marks} marks ·{" "}
                    {a.max_attempts} attempt{a.max_attempts !== 1 ? "s" : ""}
                  </div>
                </div>
                <Link className="btn-primary btn-sm" to={`/student/a/${a.id}`}>
                  Start
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid">
        <div className="col-3">
          <StatCard label="Assignments" value={String(stats.total)} />
        </div>
        <div className="col-3">
          <StatCard label="Completed" value={String(stats.completed)} />
        </div>
        <div className="col-3">
          <StatCard label="Pending" value={String(stats.pending)} />
        </div>
        <div className="col-3">
          <StatCard
            label="Average score"
            value={stats.average_percentage == null ? "—" : `${stats.average_percentage}%`}
          />
        </div>

        {chartData.length > 0 && (
          <div className="col-12">
            <Card title="Your scores" subtitle="Best vs most recent attempt (%)">
              <BarChart data={chartData} />
            </Card>
          </div>
        )}

        <div className="col-12">
          <Card title={`Assignments for ${s.class_name}`}>
            {d.assignments.length === 0 ? (
              <p className="muted-note">
                No assignments have been set for your class yet.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Assignment</th>
                      <th>Subject / Topic</th>
                      <th>Questions</th>
                      <th>Attempts</th>
                      <th>Best</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.assignments.map((a) => {
                      const done = a.attempts_used > 0;
                      const canTake = a.attempts_left > 0;
                      return (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 600 }}>{a.title}</td>
                          <td>
                            {a.subject}
                            <span className="dim"> · {a.topic}</span>
                          </td>
                          <td>
                            {a.question_count} · {a.total_marks} m
                          </td>
                          <td>
                            {a.attempts_used}/{a.max_attempts}
                          </td>
                          <td>
                            {done ? (
                              <span
                                className={`score-pill ${
                                  a.best_percentage >= 40 ? "score-pill--ok" : "score-pill--low"
                                }`}
                              >
                                {Math.round(a.best_percentage)}%
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <Link
                              className={canTake ? "btn-primary btn-sm" : "btn-ghost btn-ghost--sm"}
                              to={`/student/a/${a.id}`}
                            >
                              {canTake ? (done ? "Retake" : "Start") : "View result"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
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
