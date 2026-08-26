-- ============================================================
-- Migration 0012 — Trilha de auditoria da exportação de candidatos (FEAT-0016)
--
-- SEGURANÇA DESTA MIGRATION: nenhuma tabela existente é tocada. Só CREATE
-- TABLE e CREATE INDEX — mesma classe de segurança da 0006
-- (candidate_checkins/checkin_events): aditiva, sem `MAINTENANCE_MODE`.
--
-- NUMERAÇÃO: `0012` é reservado deliberadamente. No momento desta
-- implementação, `0010` (FEAT-0009, papel de host) e `0011` (FEAT-0014,
-- descrição de necessidades especiais) existem em branches próprios ainda
-- não mesclados em `develop` — o próximo número "livre" visto daqui seria
-- `0010`, mas não é. Ao aplicar em staging/produção, `0010` e `0011` devem
-- já estar aplicadas, nesta ordem, antes desta.
-- ============================================================

-- ------------------------------------------------------------
-- candidate_export_events — registro APPEND-ONLY de cada exportação de
-- candidatos em CSV. Não guarda o arquivo em si, só o fato de que ele foi
-- gerado: quem pediu, quando, qual recorte de edição, se campos sensíveis
-- (gênero/etnia) foram incluídos, e quantas linhas saíram.
--
-- `actor_id`/`process_id` usam ON DELETE RESTRICT, não CASCADE: isto é
-- trilha de compliance, não log de operação (diferente de
-- checkin_events.candidate_id). Apagar um usuário ou uma edição não pode
-- apagar em silêncio o registro de que um dado sensível saiu do sistema.
-- Não deve colidir na prática — membros saem por deactivated_at (FEAT-0003),
-- e não há hoje nenhuma rota que apague selection_processes.
--
-- `process_id` é NULL quando o recorte pedido foi "todas as edições"
-- (ALL_EDITIONS) — não há linha de selection_processes para apontar nesse
-- caso. `process_label` é sempre preenchido (snapshot do rótulo no momento
-- da exportação, ou "Todas as edições"), então o registro continua legível
-- mesmo que o rótulo de uma edição mude depois.
--
-- Nenhuma rota desta feature expõe UPDATE/DELETE sobre esta tabela — o
-- append-only é garantido por ausência de rota, não por trigger de banco.
-- ------------------------------------------------------------

CREATE TABLE candidate_export_events (
  id                        TEXT PRIMARY KEY,
  actor_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  process_id                TEXT REFERENCES selection_processes(id) ON DELETE RESTRICT,
  process_label             TEXT NOT NULL,
  included_sensitive_fields INTEGER NOT NULL CHECK (included_sensitive_fields IN (0, 1)),
  row_count                 INTEGER NOT NULL CHECK (row_count >= 0),
  created_at                TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ------------------------------------------------------------
-- Índices — mesmo raciocínio de idx_checkin_events_* (0006): consultas
-- futuras de auditoria filtram por quem exportou ou por período.
-- ------------------------------------------------------------

CREATE INDEX idx_candidate_export_events_actor      ON candidate_export_events(actor_id);
CREATE INDEX idx_candidate_export_events_created_at ON candidate_export_events(created_at);
