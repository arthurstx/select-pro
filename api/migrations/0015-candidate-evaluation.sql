-- ============================================================
-- Migration 0015 — Avaliação dos candidatos (FEAT-0013)
--
-- Dropa `metrics` (órfã desde `0001-schema.sql`, sem nenhum consumidor —
-- `MetricRow`/`metrics_id` nunca foram usados por código de produção) e
-- recria `evaluations` (também órfã, com design que não servia ao
-- requisito: repetia cor/observação por linha em vez de uma cor geral por
-- avaliação e uma nota por critério). `evaluation_scores` é nova.
--
-- IMPACTO NOS DADOS (Princípio III): nenhum. `metrics`/`evaluations` estão
-- vazias em todo ambiente conhecido até o momento desta migration. ⚠️
-- ANTES DE APLICAR EM STAGING/PRODUÇÃO, CONFIRME (`SELECT COUNT(*) FROM
-- evaluations` / `... FROM metrics`) QUE CONTINUAM VAZIAS.
--
-- Puramente aditiva em efeito (tabelas vazias, sem filhos com dados):
-- dispensa MAINTENANCE_MODE.
-- ============================================================

DROP TABLE IF EXISTS evaluations;
DROP TABLE IF EXISTS metrics;

CREATE TABLE evaluations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  candidate_id  TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  overall_color TEXT NOT NULL CHECK (overall_color IN ('RED', 'YELLOW', 'GREEN')),
  feedback      TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT,

  UNIQUE (user_id, candidate_id)  -- FR-004: reenviar edita, nunca duplica
);

CREATE INDEX idx_evaluations_candidate ON evaluations(candidate_id);

CREATE TABLE evaluation_scores (
  evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  criterion     TEXT NOT NULL CHECK (criterion IN (
    'raciocinio_logico', 'trabalho_equipe', 'lideranca', 'proatividade', 'comunicacao'
  )),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5),

  PRIMARY KEY (evaluation_id, criterion)
);
