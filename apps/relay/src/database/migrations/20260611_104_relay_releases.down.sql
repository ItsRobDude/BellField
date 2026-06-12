DROP TABLE IF EXISTS relay_release_downloads;
DROP TABLE IF EXISTS relay_releases;
ALTER TABLE relay_shops DROP COLUMN IF EXISTS update_window_end;
