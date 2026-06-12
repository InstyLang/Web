import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, PackageDetail } from "../lib/api";

export default function PackageDetailPage() {
  const { owner = "", name = "" } = useParams();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<PackageDetail>(`/api/packages/${owner}/${name}`)
      .then(setPkg)
      .catch((e: ApiError) => setError(e.message));
  }, [owner, name]);

  if (error) return <div className="container"><p className="empty">{error}</p></div>;
  if (!pkg) return <div className="container"><p className="empty">Loading…</p></div>;

  const latest = pkg.versions.find((v) => !v.yanked) ?? pkg.versions[0];
  const importName = `${pkg.owner}::${pkg.packageName}`;

  return (
    <div className="container">
      <h1 className="page-title">
        {pkg.owner}
        <span className="sep">::</span>
        {pkg.packageName}
      </h1>
      {pkg.description && <p className="subtitle">{pkg.description}</p>}

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Install</div>
        <div className="code">cloud install {pkg.name}{latest ? `@^${latest.version}` : ""}</div>
        <div className="hint" style={{ marginTop: 12, marginBottom: 8 }}>Then import it in your code:</div>
        <div className="code">import {importName}</div>
      </div>

      <div className="section-title">Versions</div>
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Published</th>
            <th>Size</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pkg.versions.map((v) => (
            <tr key={v.version}>
              <td>
                <span className="code inline">{v.version}</span>
              </td>
              <td>{v.publishedAt.slice(0, 10)}</td>
              <td>{(v.sizeBytes / 1024).toFixed(1)} KB</td>
              <td>
                {v.yanked ? <span className="tag warn">yanked</span> : <span className="tag ok">live</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
