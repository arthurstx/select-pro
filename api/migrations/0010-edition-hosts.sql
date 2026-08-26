-- FEAT-0009 — papel de host por edição do processo seletivo (D4).
-- Aditiva: tabela nova, vazia, sem MAINTENANCE_MODE.
--
-- A existência da linha (process_id, user_id) É o fato de ser host naquela
-- edição — sem coluna de estado. Alternar para "avaliador" é DELETE, não
-- UPDATE (ver evaluators.repository.ts).

CREATE TABLE edition_hosts (
  id         TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  UNIQUE (process_id, user_id)
);

CREATE INDEX idx_edition_hosts_process ON edition_hosts(process_id);
CREATE INDEX idx_edition_hosts_user ON edition_hosts(user_id);
