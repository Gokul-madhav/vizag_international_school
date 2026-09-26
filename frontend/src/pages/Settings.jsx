import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui.jsx";
import {
  fetchAcademicsTree,
  fetchStudents,
  promoteClass,
} from "../api.js";
import { FLAG_DEFAULTS, useSettings } from "../settings.jsx";

const ROMAN = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6,
  vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
};

// Best-effort "grade number" from a class name so we can suggest the next class.
function gradeNum(name = "") {
  const s = name.toLowerCase().trim();
  const dm = s.match(/(\d+)\s*$/);
  if (dm) return parseInt(dm[1], 10);
  const rm = s.match(/\b([ivx]+)\s*$/);
  if (rm && ROMAN[rm[1]]) return ROMAN[rm[1]];
  return null;
}

export default function Settings() {
  const { flags, meta, backend, loaded, save } = useSettings();

  const [local, setLocal] = useState(flags);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [classes, setClasses] = useState([]);
  const [counts, setCounts] = useState({});
  const [promo, setPromo] = useState({ from: "", to: "", busy: false, note: "", error: "" });

  useEffect(() => {
    setLocal(flags);
  }, [flags]);

  const loadAcademics = useCallback(async () => {
    const [t, s] = await Promise.all([fetchAcademicsTree(), fetchStudents()]);
    const cs = t.data?.classes || [];
    setClasses(cs);
    const c = {};
    for (const st of s.data?.students || []) {
      c[st.class_id] = (c[st.class_id] || 0) + 1;
    }
    setCounts(c);
  }, []);

  useEffect(() => {
    loadAcademics();
  }, [loadAcademics]);

  const keys = Object.keys(FLAG_DEFAULTS);
  const dirty = keys.some((k) => Boolean(local[k]) !== Boolean(flags[k]));
  const toggle = (k) => {
    setStatus("");
    setLocal((l) => ({ ...l, [k]: !l[k] }));
  };

  const apply = async () => {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      await save(local);
      setStatus("Saved. Changes apply across the app.");
    } catch (e) {
      setError(e.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  // --- class promotion ------------------------------------------------ //
  const className = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  const onPickFrom = (id) => {
    setPromo((p) => {
      let to = p.to;
      if (!to && id) {
        const fromNum = gradeNum(className[id]);
        const next = classes.find((c) => gradeNum(c.name) === fromNum + 1);
        if (fromNum != null && next) to = next.id;
      }
      return { ...p, from: id, to, note: "", error: "" };
    });
  };

  const runPromote = async () => {
    if (!promo.from || !promo.to || promo.from === promo.to) return;
    const n = counts[promo.from] || 0;
    const ok = window.confirm(
      `Move ${n} student${n !== 1 ? "s" : ""} from "${className[promo.from]}" ` +
        `to "${className[promo.to]}"?\n\nSections are re-matched by name where the ` +
        `target class has them, otherwise cleared. This cannot be undone automatically.`
    );
    if (!ok) return;
    setPromo((p) => ({ ...p, busy: true, note: "", error: "" }));
    try {
      const res = await promoteClass(promo.from, promo.to);
      setPromo((p) => ({
        ...p,
        busy: false,
        from: "",
        to: "",
        note: `Moved ${res.moved} student${res.moved !== 1 ? "s" : ""} to "${
          className[promo.to]
        }".`,
      }));
      await loadAcademics();
    } catch (e) {
      setPromo((p) => ({ ...p, busy: false, error: e.message || "Promotion failed." }));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Turn features on or off across the whole app, and run the year-end
            class promotion.
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
      {status && <div className="save-note">{status}</div>}

      <div className="grid">
        <div className="col-7">
          <Card title="Feature switches">
            {!loaded ? (
              <p className="muted-note">Loading…</p>
            ) : (
              <>
                <div className="switch-list">
                  {keys.map((k) => (
                    <div className="switch-row" key={k}>
                      <div className="switch-row__text">
                        <div className="switch-row__label">{meta[k]?.label || k}</div>
                        <div className="switch-row__desc">{meta[k]?.description || ""}</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(local[k])}
                        className={`toggle ${local[k] ? "toggle--on" : ""}`}
                        onClick={() => toggle(k)}
                      >
                        <span className="toggle__knob" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="settings-actions">
                  <button className="btn-primary" disabled={!dirty || saving} onClick={apply}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  {dirty && (
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        setLocal(flags);
                        setStatus("");
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="col-5">
          <Card title="Promote a class (year-end)">
            <p className="muted-note">
              Move every student in a class up to the next class at the end of the
              academic year. Sections are re-matched by name.
            </p>

            {classes.length < 2 ? (
              <p className="muted-note">Add at least two classes first.</p>
            ) : (
              <div className="q-form">
                <label className="field">
                  <span>From class</span>
                  <select value={promo.from} onChange={(e) => onPickFrom(e.target.value)}>
                    <option value="">Select class…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({counts[c.id] || 0} student
                        {(counts[c.id] || 0) !== 1 ? "s" : ""})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>To class</span>
                  <select
                    value={promo.to}
                    onChange={(e) =>
                      setPromo((p) => ({ ...p, to: e.target.value, note: "", error: "" }))
                    }
                  >
                    <option value="">Select class…</option>
                    {classes
                      .filter((c) => c.id !== promo.from)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>

                <button
                  className="btn-warn"
                  disabled={!promo.from || !promo.to || promo.busy}
                  onClick={runPromote}
                >
                  {promo.busy ? "Promoting…" : "Promote all students"}
                </button>

                {promo.error && <div className="form-error">{promo.error}</div>}
                {promo.note && <div className="save-note" style={{ margin: 0 }}>{promo.note}</div>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
