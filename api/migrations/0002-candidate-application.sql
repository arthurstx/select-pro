-- ============================================================
-- Migration 0002 — Questionário de inscrição (FEAT-0001 v2.0)
--
-- O wizard de inscrição (FEAT-0001-UI v2.0) passou de tela única para
-- 6 etapas, adicionando um questionário novo. `ethnicity` entra como
-- coluna em `candidates` (mesma natureza de `gender`: demografia do
-- candidato). As respostas do questionário em si (como conheceu,
-- confirmação do MEJ, experiências/motivação, disponibilidade) vivem
-- em `candidate_applications`, tabela 1:1 separada — mantém
-- `candidates` como identidade+demografia enxuta e permite um segundo
-- processo seletivo no futuro sem alterar essa tabela.
-- ============================================================

-- SQLite exige DEFAULT para adicionar coluna NOT NULL em tabela existente.
ALTER TABLE candidates ADD COLUMN ethnicity TEXT NOT NULL DEFAULT 'nao-informado'
  CHECK (ethnicity IN ('branca', 'preta', 'parda', 'amarela', 'indigena', 'nao-informado'));

CREATE TABLE candidate_applications (
  id TEXT PRIMARY KEY,

  -- UNIQUE garante o 1:1 com candidates.
  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE ON UPDATE CASCADE,

  referral_source TEXT NOT NULL CHECK (referral_source IN (
    'instagram', 'linkedin', 'campus', 'indicacao', 'outros'
  )),
  mej_acknowledged     INTEGER NOT NULL CHECK (mej_acknowledged IN (0, 1)),
  experience           TEXT NOT NULL,
  motivation           TEXT NOT NULL,
  saturday_restriction INTEGER NOT NULL CHECK (saturday_restriction IN (0, 1)),
  special_needs        INTEGER NOT NULL CHECK (special_needs IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

CREATE INDEX idx_candidate_app_candidate ON candidate_applications(candidate_id);
