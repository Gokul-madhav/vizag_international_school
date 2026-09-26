import { useEffect, useState } from "react";
import { fetchAcademicsTree, fetchTests, testsExportUrl } from "../api.js";
import { Card } from "../components/ui.jsx";

function CopyLinkButton({ url }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <button
      type="button"
      className="btn-ghost btn-ghost--sm"
      onClick={copy}
      title={url}
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

export default function Tests() {
  const [tree, setTree] = useState({ classes: [] });
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [classId, setClassId] = useState("");

  useEffect(() => {
    fetchAcademicsTree().then(({ data }) => setTree(data || { classes: [] }));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTests(classId).then(({ data }) => {
      if (!alive) return;
      setTests(data.tests || []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [classId]);

  const classes = tree.classes || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tests &amp; Assignment Links</h1>
          <p className="page-sub">
            Every test across the school — subject, chapter and a direct link
            you can copy or share. Filter by class and export the whole list
            to Excel.
          </p>
        </div>
        <a
          className="btn-primary"
          href={testsExportUrl(classId)}
          target="_blank"
          rel="noreferrer"
        >
          Export to Excel
        </a>
      </div>

      <Card>
        <div className="filter-bar">
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="muted-note" style={{ alignSelf: "center" }}>
            {tests.length} test{tests.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <p className="muted-note">Loading tests…</p>
        ) : tests.length === 0 ? (
          <p className="muted-note">No tests found for this filter.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Chapter / Topic</th>
                  <th>Test Name</th>
                  <th>Questions</th>
                  <th>Marks</th>
                  <th>Attempts</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td>{t.class}</td>
                    <td>{t.subject}</td>
                    <td>{t.topic}</td>
                    <td style={{ fontWeight: 600 }}>{t.title}</td>
                    <td>{t.question_count}</td>
                    <td>{t.total_marks}</td>
                    <td>{t.max_attempts}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <a
                          className="btn-ghost btn-ghost--sm"
                          href={t.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                        <CopyLinkButton url={t.link} />
                      </div>
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
