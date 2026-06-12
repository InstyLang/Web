// Thin fetch wrapper for the Worker API. Same-origin, cookie-based auth.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? `request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export interface Me {
  user: { email: string; accountName: string } | null;
}

export interface PackageSummary {
  ownerName: string;
  packageName: string;
  description: string;
  versionCount: number;
  lastPublishedAt: string | null;
}

export interface Token {
  id: number;
  tokenPrefix: string;
  scope: string;
  name: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface PackageVersion {
  version: string;
  checksumSha256: string;
  sizeBytes: number;
  yanked: boolean;
  publishedAt: string;
  manifest: unknown;
}

export interface PackageDetail {
  name: string;
  owner: string;
  packageName: string;
  description: string;
  createdAt: string;
  versions: PackageVersion[];
}
