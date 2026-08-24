-- ============================================================
-- Migration 0008 — Solicitações de cadastro pendentes (FEAT-0008)
--
-- Pós-júnior e trainee passam a poder se cadastrar, mas a conta só é criada
-- quando um admin aprova (ver specs/008-member-status-approval/, R1).
--
-- SEGURANÇA DESTA MIGRATION: puramente aditiva — duas tabelas novas, nenhum
-- ALTER/DROP em tabela existente. Mesma classificação da 0005: dispensa
-- MAINTENANCE_MODE (Princípio III da constitution).
-- ============================================================

-- ------------------------------------------------------------
-- Solicitações de cadastro
--
-- Snapshot do membro (vindo da Supabase) + credencial, guardados até a
-- decisão — a conta em `users`/`member_profiles` só é criada na aprovação
-- (research.md R1). Sem CHECK em course/gender/ethnicity/member_status, pelo
-- mesmo motivo de `member_profiles`: são valores de um sistema que não
-- controlamos.
-- ------------------------------------------------------------
CREATE TABLE signup_requests (
  id TEXT PRIMARY KEY,

  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,

  -- Id do membro na Supabase (uuid) — mesma chave de correlação estável que
  -- `member_profiles.member_id` usa.
  member_id      TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  phone          TEXT NOT NULL,
  birth_date     TEXT,
  course         TEXT NOT NULL,
  semester       INTEGER NOT NULL,
  gender         TEXT NOT NULL,
  ethnicity      TEXT NOT NULL,
  member_status  TEXT NOT NULL, -- "inactive" | "trainee" na prática (FR-004)
  manager        INTEGER NOT NULL DEFAULT 0,

  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- FR-016: no máximo uma pendente por email. Índice parcial, não UNIQUE
-- simples — precisa permitir várias linhas históricas (recusada -> nova
-- solicitação, FR-018) para o mesmo email, só nunca duas pendentes ao mesmo
-- tempo. Serve de rede de segurança contra corrida além da checagem prévia
-- que o service faz (research.md R3).
CREATE UNIQUE INDEX idx_signup_requests_pending_email
  ON signup_requests(email) WHERE status = 'pending';

CREATE INDEX idx_signup_requests_status ON signup_requests(status);
CREATE INDEX idx_signup_requests_email  ON signup_requests(email);

-- ------------------------------------------------------------
-- Tokens de leitura da solicitação
--
-- Mesmo papel que `password_reset_tokens` tem para reset de senha: credencial
-- opaca, hash-only no banco. Difere dele por não ter `used_at` — este token
-- NÃO autoriza a decisão (só a visualização antes do login, research.md R2),
-- então não é consumido por uso, só expira.
-- ------------------------------------------------------------
CREATE TABLE signup_approval_tokens (
  id                 TEXT PRIMARY KEY,
  signup_request_id TEXT NOT NULL REFERENCES signup_requests(id) ON DELETE CASCADE,

  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, -- 7 dias (spec.md, Assumptions)

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_signup_approval_tokens_request ON signup_approval_tokens(signup_request_id);
