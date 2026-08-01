-- ============================================================
-- Schema SQLite / Cloudflare D1
-- Gerado a partir do DBML fornecido
--
-- Observações:
-- - D1 aplica foreign keys por padrão (equivalente a
--   `PRAGMA foreign_keys = ON` em toda transação), então não é
--   necessário declarar esse PRAGMA aqui.
-- - IDs são TEXT (varchar) -- pensados para UUID/ULID gerados
--   pela aplicação. Se preferir IDs autoincrementais, troque
--   `TEXT PRIMARY KEY` por `INTEGER PRIMARY KEY AUTOINCREMENT`.
-- - datas (`datetime`) são armazenadas como TEXT em ISO-8601
--   (formato nativo do SQLite para funções de data).
-- - Ao rodar com Wrangler, salve como
--   `migrations/0001_init.sql` e aplique com:
--     wrangler d1 migrations apply <DB_NAME>
-- ============================================================

-- ============================================================
-- Tabelas de referência (lookup tables)
-- ============================================================

CREATE TABLE roles (
  id    TEXT PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id    TEXT PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);

CREATE TABLE semesters (
  id    TEXT PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);

CREATE TABLE rooms (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0)
);

CREATE TABLE metrics (
  id    TEXT PRIMARY KEY,
  type  TEXT,
  score INTEGER
);

-- ============================================================
-- Entidades principais
-- ============================================================

CREATE TABLE users (
  id      TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  email    TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  password TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

CREATE INDEX idx_user_role ON users(role_id);

CREATE TABLE candidates (
  id TEXT PRIMARY KEY,

  course_id   TEXT NOT NULL REFERENCES courses(id)   ON DELETE RESTRICT ON UPDATE CASCADE,
  semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  gender TEXT NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'NON_BINARY')),

  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

CREATE INDEX idx_candidate_course ON candidates(course_id);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,

  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  name TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

CREATE INDEX idx_group_room ON groups(room_id);

-- ============================================================
-- Tabelas de junção (many-to-many)
-- ============================================================

CREATE TABLE group_evaluators (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE ON UPDATE CASCADE,

  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_group_eval_group ON group_evaluators(group_id);

CREATE TABLE group_candidates (
  group_id     TEXT NOT NULL REFERENCES groups(id)     ON DELETE CASCADE ON UPDATE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE ON UPDATE CASCADE,

  "order" INTEGER,

  PRIMARY KEY (group_id, candidate_id)
);

CREATE INDEX idx_group_cand_group ON group_candidates(group_id);

-- ============================================================
-- Avaliações
-- ============================================================

CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,

  user_id      TEXT NOT NULL REFERENCES users(id)     ON DELETE RESTRICT ON UPDATE CASCADE,
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