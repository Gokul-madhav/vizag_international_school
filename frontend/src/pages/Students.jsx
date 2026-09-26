import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  addStudent,
  bulkUploadStudents,
  deleteStudent,
  fetchAcademicsTree,
  fetchStudents,
} from "../api.js";
import { Card } from "../components/ui.jsx";
import { useSettings } from "../settings.jsx";

const EMPTY = {
  student_id: "",
  name: "",
  class_id: "",
  section_id: "",
  parent_name: "",
  parent_phone: "",
};

export default function Students() {
  const { flags } = useSettings();
  const [tree, setTree] = useState({ classes: [] });
  const [students, setStudents] = useState([]);
  const [backend, setBackend] = useState("offline");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const [filterClass, setFilterClass] = useState("all");
  const [query, setQuery] = useState("");

  const [upload, setUpload] = useState({ busy: false, result: null, error: "" });
  const fileRef = useRef(null);

  const reload = useCallback(async () => {
    const [t, s] = await Promise.all([fetchAcademicsTree(), fetchStudents()]);
    setTree(t.data || { classes: [] });
    setStudents(s.data.students || []);
    setBackend(s.data.backend || "offline");
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const classes = tree.classes || [];
  const classById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c])),
    [classes]
  );

  const className = (id) => classById[id]?.name || "—";
  const sectionName = (student) => {
    const c = classById[student.class_id];
    const sec = c?.sections.find((x) => x.id === student.section_id);
    return sec ? sec.name : "—";
  };

  const formClass = classById[form.class_id];
  const formSections = formClass?.sections || [];

  const setField = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "class_id" ? { section_id: "" } : {}),
    }));

  const submit = async (e) => {
    e.preventDefault();
    if (
      !form.student_id.trim() ||
      !form.name.trim() ||
      !form.class_id ||
      !form.parent_name.trim() ||
      !form.parent_phone.trim()
    ) {
      setError(
        "Student ID, name, class, parent name and parent number are required."
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addStudent({
        student_id: form.student_id.trim(),
        name: form.name.trim(),
        class_id: form.class_id,
        section_id: form.section_id || null,
        parent_name: form.parent_name.trim(),
        parent_phone: form.parent_phone.trim(),
      });
      setForm(EMPTY);
      await reload();
    } catch (err) {
      setError(err.message || "Could not add the student.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (student) => {
    if (!window.confirm(`Remove ${student.name}?`)) return;
    setError("");
    try {
      await deleteStudent(student.id);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const doUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUpload({ busy: true, result: null, error: "" });
    try {
      const result = await bulkUploadStudents(file);
      setUpload({ busy: false, result, error: "" });
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (err) {
      setUpload({ busy: false, result: null, error: err.message || "Upload failed" });
    }
  };

  const visible = students.filter((s) => {
    if (filterClass !== "all" && s.class_id !== filterClass) return false;
    if (!query.trim()) return true;
    const hay = `${s.student_id || ""} ${s.name} ${s.parent_name} ${s.parent_phone}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-sub">
            Add students one by one or import a Word / Excel list. Each student
            has an ID, class, section and parent contact details.
          </p>
        </div>
        <span className={`backend-badge ${backend === "supabase" ? "is-live" : ""}`}>
          {backend === "supabase"
            ? "Supabase connected"
            : backend === "memory"
            ? "In-memory store"
            : "Backend offline"}
        </span>
      </div>

      {error && <div className="offline-banner">{error}</div>}

      <div className="grid">
        {/* ---- Add student ------------------------------------------- */}
        <div className="col-5">
          <Card title="Add a student">
            {classes.length === 0 ? (
              <p className="muted-note">
                Add at least one class first in{" "}
                <Link to="/admin/academics">Classes &amp; Sections</Link>.
              </p>
            ) : (
              <form className="q-form" onSubmit={submit}>
                <label className="field">
                  <span>Student ID</span>
                  <input
                    value={form.student_id}
                    onChange={(e) => setField("student_id", e.target.value)}
                    placeholder="e.g. VIS-1001"
                  />
                </label>

                <label className="field">
                  <span>Student name</span>
                  <input
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="e.g. Aarav Gupta"
                  />
                </label>

                <label className="field">
                  <span>Class</span>
                  <select
                    value={form.class_id}
                    onChange={(e) => setField("class_id", e.target.value)}
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
                  <span>Section</span>
                  <select
                    value={form.section_id}
                    onChange={(e) => setField("section_id", e.target.value)}
                    disabled={!form.class_id || formSections.length === 0}
                  >
                    <option value="">
                      {!form.class_id
                        ? "Select a class first"
                        : formSections.length === 0
                        ? "No sections for this class"
                        : "Select section…"}
                    </option>
                    {formSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Parent / guardian name</span>
                  <input
                    value={form.parent_name}
                    onChange={(e) => setField("parent_name", e.target.value)}
                    placeholder="e.g. Rakesh Gupta"
                  />
                </label>

                <label className="field">
                  <span>Parent / guardian number</span>
                  <input
                    type="tel"
                    value={form.parent_phone}
                    onChange={(e) => setField("parent_phone", e.target.value)}
                    placeholder="e.g. +91 90000 11111"
                  />
                </label>

                <button className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Add student"}
                </button>
              </form>
            )}
          </Card>

          {flags.bulk_import && (
          <Card title="Bulk add from a file" className="mt">
            <p className="muted-note">
              Upload a <strong>.xlsx</strong> or <strong>.docx</strong> list — every
              student row is added. Classes / sections named in the file are
              created automatically if they don&rsquo;t exist.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm,.docx"
              className="file-input"
              onChange={() => setUpload((u) => ({ ...u, result: null, error: "" }))}
            />
            <button className="btn-primary" onClick={doUpload} disabled={upload.busy}>
              {upload.busy ? "Importing…" : "Upload & import"}
            </button>

            {upload.error && <div className="form-error">{upload.error}</div>}
            {upload.result && (
              <div className="upload-result">
                <b>{upload.result.added}</b> added
                {upload.result.skipped > 0 && (
                  <>
                    {" "}
                    · <b>{upload.result.skipped}</b> skipped
                  </>
                )}
                {upload.result.createdClasses?.length > 0 && (
                  <div>New classes: {upload.result.createdClasses.join(", ")}</div>
                )}
                {upload.result.createdSections?.length > 0 && (
                  <div>New sections: {upload.result.createdSections.join(", ")}</div>
                )}
                {upload.result.notes?.length > 0 && (
                  <ul>
                    {upload.result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <details className="fmt-help">
              <summary>Expected file format</summary>
              <p>
                First row is a header. Recognised columns (any order):{" "}
                <code>student_id</code>, <code>name</code>, <code>class</code>,{" "}
                <code>section</code>, <code>parent_name</code>,{" "}
                <code>parent_phone</code>. Common aliases work too (<code>roll no</code>,{" "}
                <code>grade</code>, <code>guardian</code>, <code>mobile</code>, …).
              </p>
              <p>
                Word files should put the list in a <strong>table</strong> with that
                header row. Sample files are in{" "}
                <code>backend/sample_uploads/</code>.
              </p>
            </details>
          </Card>
          )}
        </div>

        {/* ---- Student list ---------------------------------------- */}
        <div className="col-7">
          <Card title={`All students (${students.length})`}>
            <div className="filter-bar">
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
              >
                <option value="all">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ID, name or parent…"
              />
            </div>

            {visible.length === 0 ? (
              <p className="muted-note">
                {students.length === 0
                  ? "No students yet — add one on the left or import a file."
                  : "No students match this filter."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Class</th>
                      <th>Section</th>
                      <th>Parent</th>
                      <th>Phone</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s) => (
                      <tr key={s.id}>
                        <td>{s.student_id || "—"}</td>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td>{className(s.class_id)}</td>
                        <td>{sectionName(s)}</td>
                        <td>{s.parent_name || "—"}</td>
                        <td>{s.parent_phone || "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="icon-x"
                            title="Remove student"
                            onClick={() => remove(s)}
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
        </div>
      </div>
    </>
  );
}
