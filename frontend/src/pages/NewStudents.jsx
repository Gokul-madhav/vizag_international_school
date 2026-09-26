import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteStudent, fetchLeads, leadsExportUrl } from "../api.js";
import { Card } from "../components/ui.jsx";

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? String(iso).slice(0, 16).replace("T", " ")
    : d.toLocaleString();
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

export default function NewStudents() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchLeads(fromDate, toDate);
    setLeads(data.leads || []);
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const preset = (n) => {
    setFromDate(daysAgo(n - 1));
    setToDate(isoDate(new Date()));
  };

  const clearRange = () => {
    setFromDate("");
    setToDate("");
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.student_id || "").toLowerCase().includes(q)
    );
  }, [leads, query]);

  const remove = async (l) => {
    if (
      !window.confirm(
        `Delete "${l.name}" (${l.student_id})? This also removes their registration and any test attempts.`
      )
    )
      return;
    await deleteStudent(l.student_pk);
    await load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Outer Students</h1>
          <p className="page-sub">
            Prospective students who registered from the &ldquo;new&rdquo;
            sign-in flow — their generated Student ID lets them take the test
            they clicked through from right away.
          </p>
        </div>
        <a
          className="btn-primary"
          href={leadsExportUrl(fromDate, toDate)}
          target="_blank"
          rel="noreferrer"
        >
          Export to Excel
        </a>
      </div>

      <Card>
        <div className="filter-bar">
          <button className="btn-ghost btn-ghost--sm" onClick={() => preset(7)}>
            Last 7 days
          </button>
          <button className="btn-ghost btn-ghost--sm" onClick={() => preset(30)}>
            Last 30 days
          </button>
          <button className="btn-ghost btn-ghost--sm" onClick={clearRange}>
            All time
          </button>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            max={toDate || undefined}
          />
          <span className="muted-note" style={{ alignSelf: "center" }}>
            to
          </span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            min={fromDate || undefined}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or Student ID…"
            style={{ minWidth: 220 }}
          />
          <span className="muted-note" style={{ alignSelf: "center" }}>
            {visible.length} of {leads.length}
          </span>
        </div>

        {loading ? (
          <p className="muted-note">Loading…</p>
        ) : leads.length === 0 ? (
          <p className="muted-note">
            No new-student registrations in this range. They show up here as
            soon as someone signs in with &ldquo;new&rdquo; and submits the
            form.
          </p>
        ) : visible.length === 0 ? (
          <p className="muted-note">No registrations match your search.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Student ID</th>
                  <th>Class</th>
                  <th>Current School</th>
                  <th>Previous %</th>
                  <th>Parent</th>
                  <th>Phone</th>
                  <th>Came from</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.name}</td>
                    <td>{l.student_id || "—"}</td>
                    <td>{l.class_name}</td>
                    <td>{l.current_school || "—"}</td>
                    <td>
                      {l.previous_percentage == null ? "—" : `${l.previous_percentage}%`}
                    </td>
                    <td>{l.parent_name || "—"}</td>
                    <td>{l.parent_phone || "—"}</td>
                    <td>{l.assignment_title || "—"}</td>
                    <td>{fmt(l.created_at)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="icon-x"
                        title="Delete student"
                        onClick={() => remove(l)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
