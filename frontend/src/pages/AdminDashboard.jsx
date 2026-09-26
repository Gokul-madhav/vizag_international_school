import { useEffect, useState } from "react";
import { fetchAdminOverview } from "../api.js";
import { Card, ListCard, StatCard } from "../components/ui.jsx";
import BarChart from "../components/charts/BarChart.jsx";
import DonutChart from "../components/charts/DonutChart.jsx";
import { useSettings } from "../settings.jsx";

const DONUT_COLORS = ["#5b5bd6", "#8f8ff0", "#c9c9f7", "#33c5c5", "#f2a63b", "#e5731b"];

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString();
}

export default function AdminDashboard() {
  const { flags } = useSettings();
  const [state, setState] = useState({ data: null, loading: true });

  useEffect(() => {
    let alive = true;
    fetchAdminOverview().then(({ data }) => {
      if (alive) setState({ data, loading: false });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state.loading) return <p className="page-sub">Loading overview…</p>;

  const d = state.data;
  if (!d) {
    return (
      <>
        <h1 className="page-title">Dashboard</h1>
        <div className="offline-banner">
          Couldn&rsquo;t load the overview — is the backend running?
        </div>
      </>
    );
  }

  const t = d.totals;

  const dayData = d.attempts_by_day.map((x, i, arr) => ({
    day: i % Math.ceil(arr.length / 8) === 0 ? x.date.slice(5) : "",
    current: x.count,
  }));

  const donut = d.students_by_class.map((x, i) => ({
    label: x.class,
    value: x.count,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">
        {t.classes} classes · {t.subjects} subjects · {t.topics} topics ·{" "}
        {t.assignments} assignments · {t.questions} questions
      </p>

      <div className="grid">
        <div className="col-3">
          <StatCard label="Total students" value={t.students.toLocaleString("en-IN")} />
        </div>
        <div className="col-3">
          <StatCard label="Assignments" value={String(t.assignments)} />
        </div>
        <div className="col-3">
          <StatCard label="Attempts (30 days)" value={String(t.attempts_30d)} />
        </div>
        <div className="col-3">
          <StatCard
            label="Average score"
            value={d.avg_score == null ? "—" : `${d.avg_score}%`}
          />
        </div>

        <div className="col-8">
          <Card
            title="Assignments taken"
            subtitle={`Last 30 days · ${t.attempts_30d} attempt${
              t.attempts_30d !== 1 ? "s" : ""
            }`}
          >
            <BarChart data={dayData} />
          </Card>
        </div>

        <div className="col-4">
          <Card title="Students by class" subtitle={`${t.students} total`}>
            {donut.length === 0 ? (
              <p className="muted-note">No students yet.</p>
            ) : (
              <div className="donut-wrap">
                <DonutChart segments={donut} />
                <div className="donut-legend">
                  {donut.map((s) => (
                    <div className="donut-legend__row" key={s.label}>
                      <span>
                        <i className="dot" style={{ background: s.color, marginRight: 8 }} />
                        {s.label}
                      </span>
                      <b>{s.value}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="col-6">
          <Card title="Attempts by class" subtitle="Count and average score">
            {d.attempts_by_class.length === 0 ? (
              <p className="muted-note">No attempts recorded yet.</p>
            ) : (
              <div className="list">
                {d.attempts_by_class.map((c) => (
                  <div className="list__row" key={c.class}>
                    <div className="list__badge">
                      {c.class.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="list__main">
                      <div className="list__name">{c.class}</div>
                      <div className="list__meta">{c.count} attempts</div>
                    </div>
                    <div className="list__value">{c.avg}%</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="col-6">
          {d.top_assignments.length === 0 ? (
            <Card title="Most attempted assignments">
              <p className="muted-note">No attempts recorded yet.</p>
            </Card>
          ) : (
            <ListCard
              title="Most attempted assignments"
              subtitle="By number of student attempts"
              items={d.top_assignments.map((a) => ({
                name: a.title,
                meta: `${a.subject} · ${a.class}`,
                value: `${a.attempts} · ${a.avg}%`,
              }))}
            />
          )}
        </div>

        {flags.activity_feed && (
          <div className="col-12">
            <Card title="Recent results">
              {d.recent_results.length === 0 ? (
                <p className="muted-note">No results yet.</p>
              ) : (
                d.recent_results.map((r, i) => (
                  <div className="notif" key={i}>
                    <span className="notif__dot" />
                    <div>
                      <div>
                        <b>{r.student}</b> completed <b>{r.assignment}</b> —{" "}
                        {Math.round(r.percentage)}%
                      </div>
                      <div className="notif__time">{fmtDate(r.submitted_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
