-- ============================================================
-- Migration 0007 — Unicidade por edição e normalização (FEAT-0006)
--
-- Três mudanças que exigem a MESMA reconstrução de `candidates`:
--   1. `email`/`phone` deixam de ser UNIQUE globais e passam a
--      `UNIQUE (process_id, email)` / `UNIQUE (process_id, phone)` — sem
--      isso, quem se inscreveu numa edição não consegue se inscrever na
--      seguinte;
--   2. `phone` é normalizado para E.164 (`+55` + DDD + número);
--   3. `gender` troca os slugs truncados por palavras inteiras.
--
-- POR QUE JUNTAS: cada rebuild desta tabela é uma aposta (ver abaixo). Três
-- apostas para três problemas da mesma tabela é escolha ruim quando uma
-- resolve os três.
--
-- ⚠️ PRÉ-REQUISITO OBRIGATÓRIO: rodar `scripts/0007-precheck.sql` no MESMO
-- ambiente, e só prosseguir com as quatro consultas vazias. A migration do
-- D1 não é transacional — uma falha no meio deixa `candidates` já dropada e
-- os dados nas `_bkp_*`. Em especial, a normalização de telefone PODE criar
-- violação de UNIQUE que não existia: hoje `(71) 98888-7777` e
-- `71988887777` convivem, porque a comparação é de string exata.
--
-- ⚠️ EXIGE MAINTENANCE_MODE="true" durante a execução, diferente da 0006
-- (que era puramente aditiva). Ordem: push -> deploy "true" -> sondar até
-- vários 503 seguidos -> migration -> deploy "false". O CD por push
-- sobrescreve deploy manual (CONTEXT.md).
--
-- POR QUE RECRIAR A TABELA: o SQLite não permite alterar/remover UNIQUE nem
-- CHECK via ALTER TABLE.
--
-- POR QUE O BACKUP DOS FILHOS: `candidates` tem CINCO filhos — quatro com
-- ON DELETE CASCADE. Com foreign keys ativas, `DROP TABLE candidates`
-- executa um DELETE FROM implícito que dispara o CASCADE e apaga tudo. As
-- saídas usuais não servem (verificado na 0004): `PRAGMA foreign_keys = OFF`
-- não é suportado pelo D1; `defer_foreign_keys` adia a verificação mas NÃO
-- impede o CASCADE — e o `foreign_key_check` posterior volta limpo, ou seja,
-- a migration reportaria sucesso tendo destruído os dados.
--
-- MUDOU DESDE A 0004: `candidate_checkins` e `checkin_events` (FEAT-0005)
-- entraram como filhos novos. `checkin_events` é histórico append-only —
-- perdê-la é irreversível por definição. E `idx_candidates_created_at`
-- (criado na 0006, sobre a própria `candidates`) some no DROP e precisa ser
-- recriado, passo que a 0004 não tinha.
--
-- Sem BEGIN/COMMIT: o D1 rejeita transação explícita em arquivo de migration.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Backup dos cinco filhos. `CREATE TABLE ... AS SELECT` copia dados sem
--    nenhuma constraint — são cópias soltas, que sobrevivem ao drop do pai.
-- ------------------------------------------------------------

CREATE TABLE _bkp_candidate_applications AS SELECT * FROM candidate_applications;
CREATE TABLE _bkp_group_candidates       AS SELECT * FROM group_candidates;
CREATE TABLE _bkp_evaluations            AS SELECT * FROM evaluations;
CREATE TABLE _bkp_candidate_checkins     AS SELECT * FROM candidate_checkins;
CREATE TABLE _bkp_checkin_events         AS SELECT * FROM checkin_events;

-- ------------------------------------------------------------
-- 2. Tabela nova: `process_id`, gender por extenso, e a unicidade escopada.
--    `email`/`phone` perdem o UNIQUE de coluna e ganham UNIQUE de tabela.
-- ------------------------------------------------------------

CREATE TABLE candidates_new (
  id TEXT PRIMARY KEY,

  -- RESTRICT: apagar uma edição não pode levar as inscrições dela junto.
  process_id TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  course   TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 10),

  gender    TEXT NOT NULL CHECK (gender IN ('masculino', 'feminino', 'outro')),
  ethnicity TEXT NOT NULL DEFAULT 'nao-informado' CHECK (ethnicity IN (
    'branca', 'preta', 'parda', 'amarela', 'indigena', 'nao-informado'
  )),

  name  TEXT NOT NULL,
  email TEXT NOT NULL,

  -- Rede de segurança: se a normalização do passo 3 produzir algo
  -- inesperado (ou NULL, para um formato não previsto), o INSERT falha em
  -- vez de gravar lixo. +55 + 10 dígitos = 13 chars; +55 + 11 = 14.
  phone TEXT NOT NULL CHECK (substr(phone, 1, 3) = '+55' AND length(phone) BETWEEN 13 AND 14),

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT,

  UNIQUE (process_id, email),
  UNIQUE (process_id, phone)
);

-- ------------------------------------------------------------
-- 3. Cópia com as três transformações. Os CASE usam ELSE para serem
--    idempotentes — rodar sobre dados já convertidos não altera nada.
-- ------------------------------------------------------------

INSERT INTO candidates_new
  (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at, updated_at)
SELECT
  c.id,
  -- A edição é derivada da janela de datas. A pré-checagem (E2) garante que
  -- toda linha casa com exatamente uma; sem isso, isto viria NULL e o
  -- NOT NULL abortaria aqui.
  (SELECT sp.id FROM selection_processes sp
    WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at),
  c.course,
  c.semester,
  CASE c.gender
    WHEN 'mascu' THEN 'masculino'
    WHEN 'fem'   THEN 'feminino'
    ELSE c.gender
  END,
  c.ethnicity,
  c.name,
  c.email,
  -- Mesmo algoritmo de `toE164` em shared/src/schemas/phone.schema.ts:
  -- tira máscara, depois prefixa conforme o tamanho.
  CASE
    WHEN length(replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')) = 13
     AND substr(replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.',''), 1, 2) = '55'
      THEN '+' || replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')
    WHEN length(replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')) IN (10, 11)
      THEN '+55' || replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')
  END,
  c.created_at,
  c.updated_at
FROM candidates c;

-- ------------------------------------------------------------
-- 4. Drop na ordem filhos -> pai. Sem filhos, o DROP do pai não tem para
--    onde cascatear.
-- ------------------------------------------------------------

DROP TABLE checkin_events;
DROP TABLE candidate_checkins;
DROP TABLE evaluations;
DROP TABLE group_candidates;
DROP TABLE candidate_applications;
DROP TABLE candidates;

ALTER TABLE candidates_new RENAME TO candidates;

-- ------------------------------------------------------------
-- 5. Recriação dos cinco filhos, voltando a referenciar `candidates`.
--    Os índices somem junto com as tabelas e precisam vir aqui também.
-- ------------------------------------------------------------

CREATE TABLE candidate_applications (
  id TEXT PRIMARY KEY,

  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE ON UPDATE CASCADE,

  referral_source TEXT NOT NULL CHECK (referral_source IN (
    'instagram', 'linkedin', 'campus', 'indicacao', 'outros'
  )),
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

-- Filhos novos desde a 0006. O UNIQUE do par é o que o
-- `ON CONFLICT DO NOTHING` da marcação de presença usa — precisa voltar.
CREATE TABLE candidate_checkins (
  id            TEXT PRIMARY KEY,
  candidate_id  TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  process_id    TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  checked_in_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checked_in_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (candidate_id, process_id)
);

CREATE TABLE checkin_events (
  id           TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  process_id   TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('marcou', 'desmarcou')),
  actor_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_candidate_checkins_process ON candidate_checkins(process_id);
CREATE INDEX idx_checkin_events_process     ON checkin_events(process_id, created_at);
CREATE INDEX idx_checkin_events_candidate   ON checkin_events(candidate_id);

-- ------------------------------------------------------------
-- 6. Índice da própria `candidates`, criado na 0006 e perdido no DROP.
--    Toda listagem do check-in filtra e ordena por esta coluna.
-- ------------------------------------------------------------

CREATE INDEX idx_candidates_created_at ON candidates(created_at);

-- ------------------------------------------------------------
-- 7. Restore. Colunas EXPLÍCITAS: a ordem física das tabelas de backup
--    reflete o schema antigo, então um `SELECT *` casaria valores com as
--    colunas erradas.
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

INSERT INTO candidate_checkins
  (id, candidate_id, process_id, checked_in_by, checked_in_at)
SELECT
   id, candidate_id, process_id, checked_in_by, checked_in_at
FROM _bkp_candidate_checkins;

INSERT INTO checkin_events
  (id, candidate_id, process_id, action, actor_id, created_at)
SELECT
   id, candidate_id, process_id, action, actor_id, created_at
FROM _bkp_checkin_events;

DROP TABLE _bkp_candidate_applications;
DROP TABLE _bkp_group_candidates;
DROP TABLE _bkp_evaluations;
DROP TABLE _bkp_candidate_checkins;
DROP TABLE _bkp_checkin_events;
