import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPortalDashboard } from "../api.js";
import { Card } from "../components/ui.jsx";
import { useStudentAuth } from "../studentAuth.jsx";

export default function StudentAssignments() {
  const { student } = useStudentAuth();
  const [state, setState] = useState({ data: null, loading: true });
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!student) return;
    setState((s) => ({ ...s, loading: true }));
    const { data } = await fetchPortalDashboard(student.student_id);
    setState({ data, loading: false });
  }, [student]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading && !state.data) return <p className="page-sub">Loading assignments…</p>;

  const all = state.data?.assignments || [];
  const q = query.trim().toLowerCase();
  const visible = q
    ? all.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.subject.toLowerCase().includes(q) ||
          a.topic.toLowerCase().includes(q)
      )
    : all;

  const s = state.data?.student;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Assignments</h1>
          <p className="page-sub">
            Every assignment set for {s?.class_name || "your class"}
            {s?.section_name ? ` – ${s.section_name}` : ""}.
          </p>
        </div>
      </div>

      <Card>
        <div className="filter-bar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, subject or topic…"
          />
          <span className="muted-note" style={{ alignSelf: "center" }}>
            {visible.length} of {all.length}
          </span>
        </div>

        {all.length === 0 ? (
          <p className="muted-note">No assignments have been set for your class yet.</p>
        ) : visible.length === 0 ? (
          <p className="muted-note">No assignments match your search.</p>
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
                {visible.map((a) => {
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
    </>
  );
}
