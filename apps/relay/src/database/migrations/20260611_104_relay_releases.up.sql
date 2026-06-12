-- Update-window end from the shop's license (YYYY-MM-DD, mirroring the
-- license file's clock-independent string-compare semantics). Bookkeeping for
-- download entitlement; the installed updater still enforces the window
-- locally against the signed license file.
ALTER TABLE relay_shops
  ADD COLUMN update_window_end TEXT
  CHECK (update_window_end IS NULL OR update_window_end ~ '^\d{4}-\d{2}-\d{2}$');

CREATE TABLE relay_releases (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  release_date TEXT NOT NULL CHECK (release_date ~ '^\d{4}-\d{2}-\d{2}$'),
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX relay_releases_version_idx ON relay_releases (version);
CREATE UNIQUE INDEX relay_releases_filename_idx ON relay_releases (filename);

CREATE TABLE relay_release_downloads (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES relay_shops(id) ON DELETE CASCADE,
  release_id TEXT NOT NULL REFERENCES relay_releases(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX relay_release_downloads_shop_idx
  ON relay_release_downloads (shop_id, downloaded_at DESC);
