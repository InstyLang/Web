// Shared validation + SemVer logic, mirroring the C++ cloud-server `core`.

export function isValidOwnerName(value: string): boolean {
  // lower-kebab: starts with a letter, [a-z0-9-], no leading/trailing/double dash.
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value) && value.length <= 64;
}

export function isValidPackageName(value: string): boolean {
  return isValidOwnerName(value);
}

// "@owner/package"
export function isValidScopedPackageName(value: string): boolean {
  if (!value.startsWith("@")) return false;
  const slash = value.indexOf("/");
  if (slash < 0) return false;
  const owner = value.slice(1, slash);
  const pkg = value.slice(slash + 1);
  return isValidOwnerName(owner) && isValidPackageName(pkg);
}

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
  build: string;
}

export function parseSemVer(value: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(value);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    prerelease: m[4] ?? "",
    build: m[5] ?? "",
  };
}

export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // A version without prerelease is higher than one with.
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === "") return 1;
  if (b.prerelease === "") return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

// Supports "*", exact "1.2.3", caret "^1.2.0", and tilde "~1.2.0".
export function matchesRange(v: SemVer, range: string): boolean {
  const r = range.trim();
  if (r === "" || r === "*") return true;

  if (r.startsWith("^")) {
    const base = parseSemVer(r.slice(1));
    if (!base) return false;
    if (compareSemVer(v, base) < 0) return false;
    if (base.major > 0) return v.major === base.major;
    if (base.minor > 0) return v.major === 0 && v.minor === base.minor;
    return v.major === 0 && v.minor === 0 && v.patch === base.patch;
  }
  if (r.startsWith("~")) {
    const base = parseSemVer(r.slice(1));
    if (!base) return false;
    if (compareSemVer(v, base) < 0) return false;
    return v.major === base.major && v.minor === base.minor;
  }
  const exact = parseSemVer(r);
  if (!exact) return false;
  return compareSemVer(v, exact) === 0;
}
