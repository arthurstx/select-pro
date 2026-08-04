-- ============================================================
-- Migration 0004 — Normalização dos slugs de curso (FEAT-0001 v3.1)
--
-- Os valores de `candidates.course` misturavam truncamentos arbitrários
-- (`eng-comp`, `eng-mecani`, `eng-eletri`, `arqui`) com um valor acentuado
-- (`eng-automação`) — o único não-ASCII do sistema, problemático em URL,
-- filtro e export CSV. Esta migration remapeia os valores existentes,
-- remove o CHECK de `course` e dropa as tabelas de lookup órfãs.
--
-- POR QUE RECRIAR A TABELA: o SQLite não permite alterar/remover um CHECK
-- via ALTER TABLE. `candidates` precisa ser reconstruída.
--
-- POR QUE O BACKUP DOS FILHOS: `candidates` tem três filhos —
-- `candidate_applications` (ON DELETE CASCADE), `group_candidates`
-- (ON DELETE CASCADE) e `evaluations` (ON DELETE RESTRICT). Com foreign keys
-- ativas, `DROP TABLE candidates` executa um DELETE FROM implícito que
-- **dispara o CASCADE e apaga todas as inscrições**.
--
-- As saídas usuais não servem aqui, e isso foi verificado em SQLite antes de
-- escrever este arquivo:
--   - `PRAGMA foreign_keys = OFF` não é suportado pelo D1;
--   - `PRAGMA defer_foreign_keys = on` NÃO protege: adia a verificação de
--     constraints, não impede a ação de CASCADE. Pior, o
--     `PRAGMA foreign_key_check` posterior volta limpo — a migration
--     reportaria sucesso tendo destruído o questionário inteiro;
--   - `PRAGMA legacy_alter_table` falha com FOREIGN KEY constraint failed.
--
-- Daí a sequência abaixo: copiar os filhos para tabelas soltas (sem FK),
-- dropar os filhos ANTES do pai (assim o DROP do pai não tem para onde
-- cascatear), reconstruir tudo e devolver os dados. Nenhuma linha é apagada.
--
-- Sem BEGIN/COMMIT: o D1 rejeita transação explícita em arquivo de migration
-- ("cannot start a transaction within a transaction").
-- ============================================================

-- ------------------------------------------------------------
-- 1. Backup dos filhos. `CREATE TABLE ... AS SELECT` copia dados e tipos,
--    mas nenhuma constraint — é justamente o que queremos: cópias sem FK,
--    que sobrevivem ao drop do pai.
-- ------------------------------------------------------------

CREATE TABLE _bkp_candidate_applications AS SELECT * FROM candidate_applications;
CREATE TABLE _bkp_group_candidates       AS SELECT * FROM group_candidates;
CREATE TABLE _bkp_evaluations            AS SELECT * FROM evaluations;

-- ------------------------------------------------------------
-- 2. Nova `candidates`, sem CHECK em `course` (o enum passa a viver só em
--    `CourseSchema`, no pacote shared). Os demais CHECKs continuam.
--    `ethnicity` volta para junto de `gender`: ela só estava no fim da tabela
--    por ter entrado via ALTER TABLE na 0002. O repositório acessa colunas
--    por nome, então a ordem física não afeta nenhuma query.
-- ------------------------------------------------------------

CREATE TABLE candidates_new (
  id TEXT PRIMARY KEY,

  course   TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 10),

  gender    TEXT NOT NULL CHECK (gender IN ('mascu', 'fem', 'outro')),
  ethnicity TEXT NOT NULL DEFAULT 'nao-informado' CHECK (ethnicity IN (
    'branca', 'preta', 'parda', 'amarela', 'indigena', 'nao-informado'
  )),

  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

-- O CASE cobre os 6 slugs que mudaram; `eng-civil` e `eng-quimica` já estavam
-- corretos e caem no ELSE. O ELSE também torna o remapeamento idempotente —
-- rodar de novo sobre dados já convertidos não altera nada, o que permite
-- reaproveitar este mesmo CASE como limpeza pós-deploy.
INSERT INTO candidates_new (id, course, semester, gender, ethnicity, name, email, phone, created_at, updated_at)
SELECT
  id,
  CASE course
    WHEN 'eng-comp'      THEN 'eng-computacao'
    WHEN 'eng-mecani'    THEN 'eng-mecanica'
    WHEN 'eng-prod'      THEN 'eng-producao'
    WHEN 'eng-automação' THEN 'eng-automacao'
    WHEN 'eng-eletri'    THEN 'eng-eletrica'
    WHEN 'arqui'         THEN 'arquitetura'
    ELSE course
  END,
  semester, gender, ethnicity, name, email, phone, created_at, updated_at
FROM candidates;

-- ------------------------------------------------------------
-- 3. Filhos primeiro, pai depois. Sem filhos na árvore, o DROP de
--    `candidates` não tem para onde cascatear.
-- ------------------------------------------------------------

DROP TABLE evaluations;
DROP TABLE group_candidates;
DROP TABLE candidate_applications;
DROP TABLE candidates;

ALTER TABLE candidates_new RENAME TO candidates;

-- ------------------------------------------------------------
-- 4. Recriação dos filhos com a DDL original (0001 + 0002 + 0003),
--    voltando a referenciar `candidates`.
-- ------------------------------------------------------------

CREATE TABLE candidate_applications (
  id TEXT PRIMARY KEY,

  -- UNIQUE garante o 1:1 com candidates.
  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE ON UPDATE CASCADE,

  referral_source TEXT NOT NULL CHECK (referral_source IN (
    'instagram', 'linkedin', 'campus', 'indicacao', 'outros'
  )),
  -- Nullable: só tem valor quando referral_source = 'outros' (ver 0003).
  referral_source_other TEXT,

  mej_acknowledged     INTEGER NOT NULL CHECK (mej_acknowledged IN (0, 1)),
  experience           TEXT NOT NULL,
  motivation           TEXT NOT NULL,
  saturday_restriction INTEGER NOT NULL CHECK (saturday_restriction IN (0, 1)),
  special_needs        INTEGER NOT NULL CHECK (special_needs IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

CREATE INDEX idx_candidate_app_candidate ON candidate_applications(candidate_id);

CREATE TABLE group_candidates (
  group_id     TEXT NOT NULL REFERENCES groups(id)     ON DELETE CASCADE ON UPDATE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE ON UPDATE CASCADE,

  "order" INTEGER,

  PRIMARY KEY (group_id, candidate_id)
);

CREATE INDEX idx_group_cand_group ON group_candidates(group_id);

CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,

  user_id      TEXT NOT NULL REFERENCES users(id)      ON DELETE RESTRICT ON UPDATE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  metrics_id   TEXT NOT NULL REFERENCES metrics(id)    ON DELETE RESTRICT ON UPDATE CASCADE,

  score    REAL,
  feedback TEXT,

  status TEXT NOT NULL DEFAULT 'RED' CHECK (status IN ('RED', 'YELLOW', 'GREEN')),

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

CREATE INDEX idx_evaluation_user      ON evaluations(user_id);
CREATE INDEX idx_evaluation_candidate ON evaluations(candidate_id);
CREATE INDEX idx_evaluation_metrics   ON evaluations(metrics_id);
CREATE INDEX idx_evaluation_status    ON evaluations(status);

CREATE UNIQUE INDEX uq_evaluation_pair ON evaluations(user_id, candidate_id, metrics_id);

-- ------------------------------------------------------------
-- 5. Restore. Colunas listadas explicitamente porque a ordem física das
--    tabelas de backup reflete o schema antigo (`referral_source_other`
--    entrou por ALTER TABLE na 0003 e ficou no fim) — um `SELECT *` casaria
--    valores com as colunas erradas.
-- ------------------------------------------------------------

INSERT INTO candidate_applications
  (id, candidate_id, referral_source, referral_source_other, mej_acknowledged,
   experience, motivation, saturday_restriction, special_needs, created_at, updated_at)
SELECT
   id, candidate_id, referral_source, referral_source_other, mej_acknowledged,
   experience, motivation, saturday_restriction, special_needs, created_at, updated_at
FROM _bkp_candidate_applications;

INSERT INTO group_candidates (group_id, candidate_id, "order")
SELECT group_id, candidate_id, "order" FROM _bkp_group_candidates;

INSERT INTO evaluations
  (id, user_id, candidate_id, metrics_id, score, feedback, status, created_at, updated_at)
SELECT
   id, user_id, candidate_id, metrics_id, score, feedback, status, created_at, updated_at
FROM _bkp_evaluations;

DROP TABLE _bkp_candidate_applications;
DROP TABLE _bkp_group_candidates;
DROP TABLE _bkp_evaluations;

-- ------------------------------------------------------------
-- 6. Tabelas de lookup órfãs. Criadas vazias na 0001 e nunca usadas —
--    nenhuma FK aponta para elas, e curso/semestre sempre foram literais.
-- ------------------------------------------------------------

DROP TABLE courses;
DROP TABLE semesters;
