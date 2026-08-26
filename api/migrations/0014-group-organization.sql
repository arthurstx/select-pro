-- ============================================================
-- Migration 0014 — Organização automática de grupos (FEAT-0012)
--
-- Recria `groups`, `group_evaluators`, `group_candidates` — órfãs desde a
-- `0001-schema.sql`, vazias e sem nenhum código as referenciando até esta
-- feature (research.md D-tech1). `groups` não tinha `process_id` (bug de
-- design pré-existente, apontado no backlog) e `room_id` era `NOT NULL`,
-- incompatível com grupo online (FR-007, spec 012).
--
-- IMPACTO NOS DADOS (Princípio III da constitution): nenhum. As três
-- tabelas estão vazias em todo ambiente conhecido até o momento desta
-- migration. ⚠️ ANTES DE APLICAR EM STAGING/PRODUÇÃO, CONFIRME (`SELECT
-- COUNT(*) FROM groups` etc.) QUE CONTINUAM VAZIAS — se alguma linha
-- existir, esta migration precisa ser reescrita seguindo o procedimento da
-- `0004` (copiar filhos, dropar, reconstruir, restaurar) em vez do
-- DROP/CREATE direto abaixo.
--
-- Puramente aditiva em efeito (tabelas vazias, sem filhos com dados):
-- dispensa MAINTENANCE_MODE.
-- ============================================================

DROP TABLE IF EXISTS group_candidates;
DROP TABLE IF EXISTS group_evaluators;
DROP TABLE IF EXISTS groups;

CREATE TABLE groups (
  id         TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  room_id    TEXT REFERENCES rooms(id) ON DELETE RESTRICT,  -- NULL = grupo online (FR-007)
  modality   TEXT NOT NULL CHECK (modality IN ('presencial', 'online')),
  name       TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT,

  CHECK (modality = 'presencial' OR room_id IS NULL)
);

CREATE INDEX idx_groups_process ON groups(process_id);
CREATE INDEX idx_groups_room ON groups(room_id);

CREATE TABLE group_evaluators (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  PRIMARY KEY (group_id, user_id),
  UNIQUE (user_id)  -- research.md D-tech3: uma pessoa, um grupo por vez
);

CREATE TABLE group_candidates (
  group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  "order"      INTEGER,

  PRIMARY KEY (group_id, candidate_id),
  UNIQUE (candidate_id)  -- idem
);

CREATE INDEX idx_group_candidates_group ON group_candidates(group_id);
