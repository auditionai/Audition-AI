CREATE TABLE IF NOT EXISTS app_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  visit_date TEXT NOT NULL,
  route TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_app_visits_date ON app_visits (visit_date, created_at);
CREATE INDEX IF NOT EXISTS idx_app_visits_user ON app_visits (user_id, created_at);
