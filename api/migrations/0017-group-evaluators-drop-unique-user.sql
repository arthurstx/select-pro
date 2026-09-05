-- ============================================================
-- Migration 0017 — Remove `UNIQUE(user_id)` de `group_evaluators` (FEAT-0021, correção)
--
-- A FEAT-0021 (spec 021, Decisão 1) passou a inserir o(s) host(s) de uma sala em TODOS
-- os grupos daquela sala — mesmo `user_id`, várias linhas com `group_id` diferente. O
-- `data-model.md` da 021 afirmou "nenhuma migration necessária" porque a tabela "já
-- suporta múltiplas linhas por grupo" — mas não percebeu que o `UNIQUE(user_id)` de
-- `0014` (pensado só para o self-service do avaliador ONLINE, "uma pessoa, um grupo por
-- vez", FEAT-0018) bloqueia exatamente esse caso: a segunda linha do mesmo host, numa
-- sala com 2+ grupos, quebra com `SQLITE_CONSTRAINT_UNIQUE` e vira 500 em
-- `POST /groups/organize/presencial` (`GroupRepository.replaceOrganization`).
--
-- POR QUE RECRIAR A TABELA: o `UNIQUE(user_id)` é inline na definição da coluna — vira
-- um autoindex do SQLite (`sqlite_autoindex_group_evaluators_2`), que não pode ser
-- removido com `DROP INDEX` (SQLite recusa dropar autoindex). `group_evaluators` não
-- tem filhos (nenhuma FK aponta para ela) — diferente da `candidates` na `0004`, não
-- precisa do backup/restore de filhos, só recriar e copiar as linhas.
--
-- A invariante "uma pessoa, um grupo por vez" do self-service ONLINE continua valendo,
-- mas passa a ser garantida pela aplicação (`GroupRepository.assignEvaluator`, que agora
-- faz `DELETE` + `INSERT` no lugar do `ON CONFLICT(user_id)` que dependia deste índice),
-- não mais pelo schema.
--
-- IMPACTO NOS DADOS (Princípio III): nenhuma linha é perdida — a tabela de origem já
-- tinha no máximo uma linha por `user_id` (constraint antiga), a cópia é 1:1.
--
-- Sem BEGIN/COMMIT: o D1 rejeita transação explícita em migration.
-- ============================================================

CREATE TABLE group_evaluators_new (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  PRIMARY KEY (group_id, user_id)
);

INSERT INTO group_evaluators_new (group_id, user_id)
SELECT group_id, user_id FROM group_evaluators;

DROP TABLE group_evaluators;

ALTER TABLE group_evaluators_new RENAME TO group_evaluators;
