-- ============================================================
-- Migration 0005 — Cadastro e autenticação de membro (FEAT-0003)
--
-- Cria o que falta para um membro da CIMATEC jr ter conta e sessão:
-- os papéis (a tabela `roles` nasceu vazia na 0001), o snapshot dos dados
-- vindos do banco da tec, as sessões e os tokens de recuperação de senha.
--
-- SEGURANÇA DESTA MIGRATION: nenhuma tabela é reconstruída. O único ALTER é
-- um ADD COLUMN, que no SQLite não recria a tabela. Isto NÃO é o caso
-- perigoso descrito na 0004 (rebuild de `candidates`, que tem três filhos e
-- dois CASCADE) — aqui não há risco de perda de dados, e o modo de manutenção
-- não é necessário para aplicá-la.
-- ============================================================

-- ------------------------------------------------------------
-- Papéis
--
-- `roles` existe desde a 0001 e nunca teve uma linha. Como `users.role_id` é
-- FK com ON DELETE RESTRICT, nenhum usuário pode ser criado antes disto.
--
-- O id é o próprio slug em vez de UUID: o papel é referenciado por nome no
-- código e no claim `role` do JWT, e um id legível dispensa um join só para
-- descobrir qual papel é qual no momento do cadastro.
--
-- `admin` é semeado mesmo sem ninguém para ocupá-lo: todo cadastro entra como
-- `avaliador` e a promoção é um UPDATE manual (FEAT-0003, seção 9).
-- ------------------------------------------------------------
INSERT INTO roles (id, value) VALUES
  ('admin', 'admin'),
  ('avaliador', 'avaliador');

-- ------------------------------------------------------------
-- Desativação manual de usuário
--
-- A elegibilidade é verificada uma única vez, no cadastro. Quem sai da
-- empresa continua com conta funcionando até alguém preencher esta coluna —
-- é o custo operacional de manter a Supabase fora do caminho crítico do
-- login (FEAT-0003, seção 9).
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN deactivated_at TEXT;

-- ------------------------------------------------------------
-- Snapshot do membro, como a tec o conhecia no momento do cadastro
--
-- Relação 1:1 com `users` (garantida pelo UNIQUE em user_id), no mesmo padrão
-- de `candidates` + `candidate_applications`: identidade e credencial ficam em
-- `users`, o resto sai de lá.
--
-- SEM CHECK em course/gender/ethnicity/status, de propósito: são valores de um
-- sistema que não controlamos e que não correspondem aos enums da aplicação
-- ("Engenharia de Computação" lá vs. "eng-computacao" aqui). Um CHECK aqui
-- faria o cadastro falhar por um dado que o membro não tem como corrigir.
-- ------------------------------------------------------------
CREATE TABLE member_profiles (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Id do membro na Supabase. Única chave de correlação estável com a tec:
  -- o email pode mudar, este não. É o que torna uma futura ressincronização
  -- possível sem depender de casar strings.
  member_id INTEGER NOT NULL UNIQUE,

  full_name  TEXT NOT NULL,
  phone      TEXT NOT NULL,
  birth_date TEXT,

  course    TEXT NOT NULL,
  semester  INTEGER NOT NULL,
  gender    TEXT NOT NULL,
  ethnicity TEXT NOT NULL,
  status    TEXT NOT NULL,

  -- Cargo na empresa. Gravado por completude; NÃO define papel na aplicação.
  manager INTEGER NOT NULL DEFAULT 0,

  -- Quando o snapshot foi tirado. Deixa explícito o quão velho o dado é.
  synced_at TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

-- ------------------------------------------------------------
-- Sessões (refresh tokens)
--
-- Uma linha por refresh token emitido. Cada /auth/refresh revoga a linha
-- atual e cria outra na mesma family_id; reapresentar um token já revogado é
-- reuso e revoga a família inteira (FEAT-0003, seção 4.3).
--
-- Só o SHA-256 do token é gravado: um dump deste banco não pode virar acesso
-- às contas. Não precisa de KDF caro — o token tem 256 bits de entropia e não
-- é adivinhável como uma senha.
--
-- IP não é coletado deliberadamente (dado pessoal sem uso definido). O
-- user_agent fica para uma futura tela de "sessões ativas".
-- ------------------------------------------------------------
CREATE TABLE sessions (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  refresh_token_hash TEXT NOT NULL UNIQUE,
  family_id          TEXT NOT NULL,

  expires_at TEXT NOT NULL,
  revoked_at TEXT,

  user_agent TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ------------------------------------------------------------
-- Tokens de recuperação de senha
--
-- Mesma disciplina das sessões: o token em claro só existe no email do
-- membro. Uso único (used_at) e validade de 30 minutos.
-- ------------------------------------------------------------
CREATE TABLE password_reset_tokens (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  token_hash TEXT NOT NULL UNIQUE,

  expires_at TEXT NOT NULL,
  used_at    TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ------------------------------------------------------------
-- Índices
--
-- `sessions.user_id` e `password_reset_tokens.user_id`: revogar todas as
-- sessões de um usuário acontece no reset de senha e na desativação.
-- `sessions.family_id`: revogação em cascata na detecção de reuso.
-- `sessions.expires_at`: prune periódico pelo Cron Trigger — a rotação cria
-- uma linha por refresh, e sem limpeza a tabela cresce sem teto contra o
-- limite de linhas do D1 no plano Free.
-- ------------------------------------------------------------
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_family ON sessions(family_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_reset_tokens_user ON password_reset_tokens(user_id);
