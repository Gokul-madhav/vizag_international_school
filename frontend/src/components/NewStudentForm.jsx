import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "./ui.jsx";
import { createLead, fetchAcademicsTree } from "../api.js";
import { useStudentAuth } from "../studentAuth.jsx";

const EMPTY = {
  name: "",
  class_id: "",
  current_school: "",
  previous_percentage: "",
  parent_name: "",
  parent_phone: "",
};

// If they arrived via a specific test link (/student/a/:id), pull the
// assignment id out so the lead records which test brought them in.
function assignmentIdFrom(path) {
  return path?.match(/\/student\/a\/([^/?]+)/)?.[1] || null;
}

export default function NewStudentForm({ redirectTo, onBack }) {
  const { login } = useStudentAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAcademicsTree().then(({ data }) => setClasses(data?.classes || []));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid =
    form.name.trim() &&
    form.class_id &&
    form.current_school.trim() &&
    form.previous_percentage !== "" &&
    form.parent_name.trim() &&
    form.parent_phone.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      const res = await createLead({
        name: form.name.trim(),
        class_id: form.class_id,
        current_school: form.current_school.trim(),
        previous_percentage: Number(form.previous_percentage),
        parent_name: form.parent_name.trim(),
        parent_phone: form.parent_phone.trim(),
        assignment_id: assignmentIdFrom(redirectTo),
      });
      await login(res.student_id);
      navigate(redirectTo || "/student", { replace: true });
    } catch (err) {
      setError(err.message || "Could not submit — please check the form and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <Card className="login-card">
        <div className="login-card__mark">📝</div>
        <h2 className="login-card__title">New student registration</h2>
        <p className="login-card__sub">
          Tell us a bit about yourself and we&rsquo;ll take you straight to the test.
        </p>
        <form onSubmit={submit} className="q-form">
          <label className="field">
            <span>Student name</span>
            <input value={form.name} onChange={set("name")} autoFocus />
          </label>
          <label className="field">
            <span>Class</span>
            <select value={form.class_id} onChange={set("class_id")}>
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Current school studying in</span>
            <input value={form.current_school} onChange={set("current_school")} />
          </label>
          <label className="field">
            <span>Previous exam percentage</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.previous_percentage}
              onChange={set("previous_percentage")}
            />
          </label>
          <label className="field">
            <span>Parent name</span>
            <input value={form.parent_name} onChange={set("parent_name")} />
          </label>
          <label className="field">
            <span>Parent number</span>
            <input value={form.parent_phone} onChange={set("parent_phone")} />
          </label>
          <button className="btn-primary" disabled={busy || !valid}>
            {busy ? "Submitting…" : "Submit & continue"}
          </button>
        </form>
        {error && <div className="form-error">{error}</div>}
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          style={{ marginTop: 10 }}
          onClick={onBack}
        >
          ← Back to sign in
        </button>
      </Card>
    </div>
  );
}
