-- Insty edge registry schema (Cloudflare D1 / SQLite).
-- Mirrors the C++ cloud-server Postgres schema, adding web users + sessions.

-- Web users authenticate with email + password; each owns one account (the
-- @owner publishing namespace).
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,    -- PBKDF2 "iterations$saltHex$hashHex"
    accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Signed session cookies reference rows here; sessionHash = sha256(rawToken).
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,           -- random session id (also the cookie value)
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    expiresAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessionsByUser ON sessions(userId);
CREATE INDEX IF NOT EXISTS sessionsByExpiry ON sessions(expiresAt);

-- Publishing accounts (the @owner namespace).
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- API tokens used by the `cloud` CLI (Authorization: Bearer <token>).
-- tokenHash = sha256(rawToken); only the prefix is shown after creation.
CREATE TABLE IF NOT EXISTS authTokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    tokenHash TEXT NOT NULL UNIQUE,
    tokenPrefix TEXT NOT NULL,
    scope TEXT NOT NULL,           -- 'publish' | 'admin'
    name TEXT NOT NULL DEFAULT '', -- human label
    expiresAt TEXT,                -- nullable
    revokedAt TEXT,                -- nullable
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS authTokensByAccount ON authTokens(accountId);

CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ownerName TEXT NOT NULL,
    packageName TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (ownerName, packageName)
);
CREATE INDEX IF NOT EXISTS packagesByOwner ON packages(ownerName);

CREATE TABLE IF NOT EXISTS packageVersions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    packageId INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    major INTEGER NOT NULL,
    minor INTEGER NOT NULL,
    patch INTEGER NOT NULL,
    prerelease TEXT NOT NULL DEFAULT '',
    manifest TEXT NOT NULL,        -- JSON text
    checksumSha256 TEXT NOT NULL,
    sizeBytes INTEGER NOT NULL,
    objectKey TEXT NOT NULL,       -- R2 object key
    yanked INTEGER NOT NULL DEFAULT 0,
    publishedBy INTEGER NOT NULL REFERENCES accounts(id),
    publishedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (packageId, version)
);
CREATE INDEX IF NOT EXISTS packageVersionsLookup
    ON packageVersions (packageId, major, minor, patch, prerelease);
