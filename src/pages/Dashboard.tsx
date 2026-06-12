import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, PackageSummary, Token } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newToken, setNewToken] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [scope, setScope] = useState("publish");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  const load = async () => {
    const [pkgs, toks] = await Promise.all([
      api.get<{ packages: PackageSummary[] }>("/api/dashboard/packages"),
      api.get<{ tokens: Token[] }>("/api/dashboard/tokens"),
    ]);
    setPackages(pkgs.packages);
    setTokens(toks.tokens);
  };

  useEffect(() => {
    if (user) void load().catch(() => undefined);
  }, [user]);

  const createToken = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNewToken("");
    try {
      const body: Record<string, unknown> = { name: tokenName, scope };
      const days = parseInt(expiresInDays, 10);
      if (!Number.isNaN(days) && days > 0) body.expiresInDays = days;
      const res = await api.post<{ token: string }>("/api/dashboard/tokens", body);
      setNewToken(res.token);
      setTokenName("");
      setExpiresInDays("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create token");
    }
  };

  const revoke = async (id: number) => {
    await api.del(`/api/dashboard/tokens/${id}`);
    await load();
  };

  if (loading || !user) return <div className="container"><p className="empty">Loading…</p></div>;

  return (
    <div className="container">
      <h1 className="page-title">Dashboard</h1>
      <p className="subtitle">
        Signed in as <strong style={{ color: "var(--text)" }}>{user.email}</strong> · publishing namespace{" "}
        <span className="tag">@{user.accountName}</span>
      </p>

      <div className="section-title">Your packages</div>
      {packages.length === 0 ? (
        <div className="card empty">
          No packages yet. Publish with <span className="code inline">cloud publish</span> using a token below.
        </div>
      ) : (
        packages.map((pkg) => (
          <Link
            key={pkg.packageName}
            to={`/packages/${pkg.ownerName}/${pkg.packageName}`}
            className="card pkg-row"
          >
            <div className="name">
              {pkg.ownerName}
              <span className="sep">::</span>
              {pkg.packageName}
            </div>
            <div className="meta">
              <span>{pkg.versionCount} version{pkg.versionCount === 1 ? "" : "s"}</span>
              {pkg.lastPublishedAt && <span>updated {pkg.lastPublishedAt.slice(0, 10)}</span>}
            </div>
          </Link>
        ))
      )}

      <div className="section-title">Publish tokens</div>
      <form className="card" onSubmit={createToken}>
        {error && <div className="error">{error}</div>}
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ flex: 2, minWidth: 160 }}
            placeholder="Token name (e.g. ci-laptop)"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
          />
          <select className="select" style={{ flex: 1, minWidth: 120 }} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="publish">publish</option>
            <option value="admin">admin</option>
          </select>
          <input
            className="input"
            style={{ flex: 1, minWidth: 120 }}
            placeholder="Expires (days)"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <button className="btn primary" type="submit">Create token</button>
        </div>
        {newToken && (
          <div className="token-reveal">
            <div className="hint" style={{ marginTop: 0 }}>Copy this token now — it won't be shown again:</div>
            <div className="code" style={{ marginTop: 8 }}>{newToken}</div>
            <div className="hint" style={{ marginTop: 10 }}>
              Use it: <span className="code inline">CLOUD_TOKEN={newToken} cloud publish</span>
            </div>
          </div>
        )}
      </form>

      {tokens.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Scope</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => {
              const revoked = Boolean(t.revokedAt);
              const expired = t.expiresAt ? new Date(t.expiresAt) < new Date() : false;
              return (
                <tr key={t.id}>
                  <td>{t.name || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td><span className="code inline">{t.tokenPrefix}…</span></td>
                  <td>{t.scope}</td>
                  <td>
                    {revoked ? (
                      <span className="tag warn">revoked</span>
                    ) : expired ? (
                      <span className="tag warn">expired</span>
                    ) : (
                      <span className="tag ok">active</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!revoked && (
                      <button className="btn danger" onClick={() => void revoke(t.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
