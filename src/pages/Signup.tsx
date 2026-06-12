import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Signup() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [accountName, setAccountName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/auth/signup", { email, password, accountName });
      await refresh();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <form className="form card" onSubmit={onSubmit}>
        <h1>Create an account</h1>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Account name (your publishing namespace)</label>
          <input
            className="input"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value.toLowerCase())}
            placeholder="acme-corp"
            required
          />
          <div className="hint">
            Packages publish under <code>@{accountName || "your-name"}/package</code> and import as{" "}
            <code>{accountName || "your-name"}::package</code>.
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <div className="hint">At least 8 characters.</div>
        </div>
        <div className="actions row">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Sign up"}
          </button>
          <div className="spacer" />
          <Link to="/login">I already have an account</Link>
        </div>
      </form>
    </div>
  );
}
