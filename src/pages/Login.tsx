import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/auth/login", { email, password });
      await refresh();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <form className="form card" onSubmit={onSubmit}>
        <h1>Log in</h1>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="actions row">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>
          <div className="spacer" />
          <Link to="/signup">Create an account</Link>
        </div>
      </form>
    </div>
  );
}
