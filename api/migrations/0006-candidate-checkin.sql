-- ============================================================
-- Migration 0006 — Validação de presença do candidato (FEAT-0005)
--
-- Cria o que falta para o check-in: a edição do processo seletivo
-- (`selection_processes`), o estado atual de presença (`candidate_checkins`)
-- e o histórico append-only de marcar/desmarcar (`checkin_events`).
--
-- SEGURANÇA DESTA MIGRATION: nenhuma tabela é reconstruída. Só CREATE TABLE,
-- CREATE INDEX e um INSERT de seed. `candidates` não é tocada — nenhuma
-- coluna nova, nenhum CHECK novo, nenhum UNIQUE alterado. Isto NÃO é o caso
-- perigoso descrito na 0004 (rebuild de `candidates`, que tem três filhos e
-- dois CASCADE) — aqui não há risco de perda de dados, e o modo de
-- manutenção não é necessário para aplicá-la.
--
-- A próxima migration que tocar `candidates` (unicidade de email/telefone
-- por edição + padronização de telefone, FEAT-0005 seção 7) não terá essa
-- sorte: valem lá as mesmas advertências da 0004.
-- ============================================================

-- ------------------------------------------------------------
-- selection_processes — uma edição do processo seletivo (jan-jul / ago-dez).
--
-- Sem coluna is_active: o processo corrente é o que contém a data de hoje
-- (FEAT-0005, seção 4.1). A linha do semestre corrente é criada sob demanda
-- pela API quando falta (seção 4.1.1) — este seed cobre só 2026.1, que já
-- passou e que a criação automática nunca geraria.
-- ------------------------------------------------------------

CREATE TABLE selection_processes (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ------------------------------------------------------------
-- candidate_checkins — ESTADO ATUAL. A existência da linha É a presença;
-- não há coluna de estado, e desmarcar apaga a linha. Histórico em
-- checkin_events, abaixo.
--
-- UNIQUE é do PAR (candidate_id, process_id), não do candidato: é o que
-- permite a mesma pessoa ter presença em edições diferentes no dia em que a
-- recandidatura for destravada, e é a constraint em que o
-- "ON CONFLICT DO NOTHING" da marcação se apoia.
--
-- checked_in_by usa ON DELETE RESTRICT: apagar um usuário não pode apagar em
-- silêncio o registro de quem confirmou presença. Na prática não deve
-- colidir — membros saem por deactivated_at (FEAT-0003), não por DELETE.
-- ------------------------------------------------------------

CREATE TABLE candidate_checkins (
  id            TEXT PRIMARY KEY,
  candidate_id  TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  process_id    TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  checked_in_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checked_in_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (candidate_id, process_id)
);

-- ------------------------------------------------------------
-- checkin_events — histórico append-only. Uma linha por mudança REAL de
-- estado; repetições idempotentes (marcar já marcado, desmarcar já
-- desmarcado) não geram evento.
--
-- Nada nas rotas de FEAT-0005 lê esta tabela — é escrita pura, para a futura
-- tela de logs do admin encontrar história em vez de começar do zero.
--
-- action mantém CHECK: conjunto fechado de dois valores, o oposto de
-- `course` (que perdeu o CHECK na FEAT-0001 v3.1 por ser um enum que cresce).
-- candidate_id usa CASCADE, diferente de candidate_checkins: é log de
-- operação, não trilha de auditoria legal — linha de log apontando para um
-- candidato removido não informa nada além de ruído.
-- ------------------------------------------------------------

CREATE TABLE checkin_events (
  id           TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  process_id   TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('marcou', 'desmarcou')),
  actor_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------

CREATE INDEX idx_candidate_checkins_process ON candidate_checkins(process_id);

-- candidates não tinha índice além do PK e dos dois UNIQUE. Toda listagem
-- desta feature filtra created_at pela janela do processo e ordena por ele.
CREATE INDEX idx_candidates_created_at ON candidates(created_at);

CREATE INDEX idx_checkin_events_process   ON checkin_events(process_id, created_at);
CREATE INDEX idx_checkin_events_candidate ON checkin_events(candidate_id);

-- ------------------------------------------------------------
-- Seed — edições já decorrida/corrente. As seguintes nascem sob demanda
-- (seção 4.1.1); este INSERT existe só para cobrir 2026.1, que já passou.
-- ------------------------------------------------------------

INSERT INTO selection_processes (id, label, starts_at, ends_at) VALUES
  ('a1cc2644-d85c-44a7-87cb-60781d8d7464', '2026.1', '2026-01-01', '2026-07-31 23:59:59'),
  ('ace24839-ec23-4942-9065-dbd45742034e', '2026.2', '2026-08-01', '2026-12-31 23:59:59');
