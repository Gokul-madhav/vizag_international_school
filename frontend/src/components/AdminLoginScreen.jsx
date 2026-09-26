import { useState } from "react";
import { Card } from "./ui.jsx";
import { useAdminAuth } from "../adminAuth.jsx";

export default function AdminLoginScreen() {
  const { login } = useAdminAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    if (!login(value)) {
      setError("Incorrect admin ID.");
    }
  };

  return (
    <div className="login-wrap">
      <Card className="login-card">
        <div className="login-card__mark">🔐</div>
        <h2 className="login-card__title">Admin sign in</h2>
        <p className="login-card__sub">Enter the admin ID to open the admin panel.</p>
        <form onSubmit={submit} className="q-form">
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="Admin ID"
          />
          <button className="btn-primary" disabled={!value.trim()}>
            Continue
          </button>
        </form>
        {error && <div className="form-error">{error}</div>}
      </Card>
    </div>
  );
}
