import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, PackageSummary } from "../lib/api";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async (q: string) => {
    setLoading(true);
    try {
      const data = await api.get<{ packages: PackageSummary[] }>(
        `/api/packages/search?q=${encodeURIComponent(q)}`,
      );
      setResults(data.packages);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run(params.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setParams(query ? { q: query } : {});
  };

  return (
    <div className="container">
      <div className="hero">
        <p className="eyebrow">Insty package registry</p>
        <h1>
          Find &amp; ship <span className="grad">Insty</span> modules
        </h1>
        <p>
          Search the registry, then pull it in with{" "}
          <span className="code inline">cloud install @owner/package</span>
        </p>
        <form className="search" onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="Search packages, e.g. http, json, parser…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn primary" type="submit">
            Search
          </button>
        </form>
      </div>

      {loading && <p className="empty">Searching the registry…</p>}
      {!loading && results.length === 0 && <p className="empty">No packages match that query yet.</p>}
      {!loading &&
        results.map((pkg) => (
          <Link
            key={`${pkg.ownerName}/${pkg.packageName}`}
            to={`/packages/${pkg.ownerName}/${pkg.packageName}`}
            className="card pkg-row"
          >
            <div className="name">
              {pkg.ownerName}
              <span className="sep">::</span>
              {pkg.packageName}
            </div>
            {pkg.description && <div className="desc">{pkg.description}</div>}
            <div className="meta">
              <span>{pkg.versionCount} version{pkg.versionCount === 1 ? "" : "s"}</span>
              {pkg.lastPublishedAt && <span>updated {pkg.lastPublishedAt.slice(0, 10)}</span>}
            </div>
          </Link>
        ))}
    </div>
  );
}
