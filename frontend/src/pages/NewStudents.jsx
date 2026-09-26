import { useEffect, useState } from "react";
import { fetchLeads } from "../api.js";
import { Card } from "../components/ui.jsx";

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? String(iso).slice(0, 16).replace("T", " ")
    : d.toLocaleString();
}

export default function NewStudents() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchLeads().then(({ data }) => {
      if (!alive) return;
      setLeads(data.leads || []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">New Students</h1>
          <p className="page-sub">
            Prospective students who registered from the &ldquo;new&rdquo;
            sign-in flow — their generated Student ID lets them take the test
            they clicked through from right away.
          </p>
        </div>
      </div>

      <Card>
        {loading ? (
          <p className="muted-note">Loading…</p>
        ) : leads.length === 0 ? (
          <p className="muted-note">
            No new-student registrations yet. They show up here as soon as
            someone signs in with &ldquo;new&rdquo; and submits the form.
          </p>
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
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
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
