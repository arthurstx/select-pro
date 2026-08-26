-- ============================================================
-- Migration 0013 — Check-in de membros (avaliadores/hosts), FEAT-0010
--
-- Espelha `candidate_checkins`/`checkin_events` (migration 0006), mas para
-- quem avalia em vez de quem é avaliado: estado atual (existência da linha
-- é a presença) + histórico append-only de marcar/desmarcar.
--
-- SEGURANÇA DESTA MIGRATION: nenhuma tabela é reconstruída. Só CREATE TABLE
-- e CREATE INDEX. `users`/`selection_processes`/`edition_hosts` não são
-- tocadas — nenhuma coluna nova, nenhum CHECK novo. Aditiva, sem
-- MAINTENANCE_MODE (Constitution Check do plan.md da 010).
-- ============================================================

-- ------------------------------------------------------------
-- member_checkins — ESTADO ATUAL. Mesma convenção da 0006: a existência da
-- linha É a presença; desmarcar apaga a linha; histórico em
-- member_checkin_events, abaixo.
--
-- UNIQUE é do PAR (user_id, process_id): a mesma pessoa pode ter presença
-- em edições diferentes (é avaliadora em mais de um semestre), nunca duas
-- linhas na mesma edição.
--
-- user_id usa ON DELETE CASCADE (diferente de checked_in_by, que usa
-- RESTRICT): se o próprio avaliador for removido, seu registro de presença
-- não faz mais sentido; mas apagar um admin não pode apagar em silêncio o
-- registro de quem confirmou presença de outra pessoa.
-- ------------------------------------------------------------

CREATE TABLE member_checkins (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  process_id    TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  checked_in_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checked_in_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (user_id, process_id)
);

-- ------------------------------------------------------------
-- member_checkin_events — histórico append-only. Uma linha por mudança REAL
-- de estado; repetições idempotentes (marcar já marcado, desmarcar já
-- desmarcado) não geram evento — mesma técnica de `WHERE changes() > 0` já
-- usada em checkin.repository.ts.
--
-- user_id usa CASCADE (é log de operação, não trilha de auditoria legal —
-- mesma justificativa da 0006 para checkin_events.candidate_id).
-- ------------------------------------------------------------

CREATE TABLE member_checkin_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  process_id   TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('marcou', 'desmarcou')),
  actor_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------

CREATE INDEX idx_member_checkins_process ON member_checkins(process_id);
CREATE INDEX idx_member_checkin_events_process ON member_checkin_events(process_id, created_at);
CREATE INDEX idx_member_checkin_events_user ON member_checkin_events(user_id);
