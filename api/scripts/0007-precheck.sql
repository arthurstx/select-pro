-- ============================================================
-- Pré-checagem da migration 0007 (FEAT-0006, seção 4.1)
--
-- NÃO é uma migration. Fica fora de `migrations/` de propósito: é só
-- verificação, e precisa poder rodar quantas vezes for preciso, em qualquer
-- ambiente, sem entrar no controle de versão do D1.
--
--   npx wrangler d1 execute <DB> --env staging --remote --file scripts/0007-precheck.sql
--
-- COMO LER O RESULTADO: se o comando terminar SEM ERRO, está liberado. Se
-- alguma checagem falhar, o wrangler aborta com
-- "CHECK constraint failed: <nome_da_checagem>" e reverte tudo — o nome da
-- coluna diz qual problema foi encontrado.
--
-- POR QUE POR CONSTRAINT, E NÃO POR SELECT: no modo `--file --remote` o
-- wrangler usa o caminho de import e imprime só um agregado
-- ("Executed N queries, M rows read"), sem exibir as linhas devolvidas. Um
-- SELECT com problema e um SELECT vazio ficam indistinguíveis na tela. Como
-- toda a segurança da 0007 depende desta checagem ser confiável, ela precisa
-- FALHAR, não apenas relatar.
--
-- Se algo falhar, rode as consultas de diagnóstico logo abaixo com
-- `--command` (que exibe resultados) para ver QUAIS linhas são o problema.
-- ============================================================

-- ============================================================
-- DIAGNÓSTICO — rode com `--command` (que exibe resultados) só se alguma
-- checagem abaixo falhar, para ver quais linhas são o problema.
--
-- E1:
--   SELECT id, name, phone FROM candidates WHERE NOT (
--     (length(replace(replace(replace(replace(replace(replace(phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')) = 13
--      AND substr(replace(replace(replace(replace(replace(replace(phone,'(',''),')',''),'-',''),' ',''),'+',''),'.',''),1,2) = '55')
--     OR length(replace(replace(replace(replace(replace(replace(phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')) IN (10,11));
--
-- E2:
--   SELECT id, name, created_at FROM candidates c WHERE NOT EXISTS
--     (SELECT 1 FROM selection_processes sp WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at);
--
-- E3: agrupe por telefone normalizado e veja os grupos com mais de uma linha
--     (a expressão está no INSERT do bloco E3, abaixo).
-- ============================================================

-- ------------------------------------------------------------
-- E1 — nenhum telefone pode estar fora dos formatos reconhecidos
--
-- Reconhecidos: 13 dígitos começando em 55, ou 10/11 dígitos (fixo/celular).
-- ------------------------------------------------------------

CREATE TABLE _precheck_e1 (
  e1_nenhum_telefone_irreconhecivel INTEGER NOT NULL
    CHECK (e1_nenhum_telefone_irreconhecivel = 1)
);

INSERT INTO _precheck_e1
SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
  FROM candidates
 WHERE NOT (
   (length(replace(replace(replace(replace(replace(replace(phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')) = 13
    AND substr(replace(replace(replace(replace(replace(replace(phone,'(',''),')',''),'-',''),' ',''),'+',''),'.',''), 1, 2) = '55')
   OR length(replace(replace(replace(replace(replace(replace(phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')) IN (10, 11)
 );

DROP TABLE _precheck_e1;

-- ------------------------------------------------------------
-- E2 — todo candidato precisa cair na janela de alguma edição
--
-- Sem isso, `process_id NOT NULL` aborta no meio da 0007. A correção é
-- cadastrar a edição faltante, não relaxar a constraint.
-- ------------------------------------------------------------

CREATE TABLE _precheck_e2 (
  e2_todo_candidato_tem_edicao INTEGER NOT NULL
    CHECK (e2_todo_candidato_tem_edicao = 1)
);

INSERT INTO _precheck_e2
SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
  FROM candidates c
 WHERE NOT EXISTS (
   SELECT 1 FROM selection_processes sp
    WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at
 );

DROP TABLE _precheck_e2;

-- ------------------------------------------------------------
-- E3 — a normalização não pode CRIAR colisão de telefone
--
-- A mais importante das três, e a única que não dá para descobrir lendo o
-- código: hoje `(71) 98888-7777` e `71988887777` são linhas distintas que
-- passam pelo UNIQUE (a comparação é de string exata). Normalizadas, viram
-- o mesmo valor e violam `UNIQUE (process_id, phone)`.
-- ------------------------------------------------------------

CREATE TABLE _precheck_e3 (
  e3_nenhuma_colisao_de_telefone INTEGER NOT NULL
    CHECK (e3_nenhuma_colisao_de_telefone = 1)
);

INSERT INTO _precheck_e3
SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
  FROM (
    SELECT (SELECT sp.id FROM selection_processes sp
             WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at) AS pid,
           CASE
             WHEN length(replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')) = 13
              AND substr(replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.',''), 1, 2) = '55'
               THEN '+' || replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')
             WHEN length(replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')) IN (10, 11)
               THEN '+55' || replace(replace(replace(replace(replace(replace(c.phone,'(',''),')',''),'-',''),' ',''),'+',''),'.','')
           END AS e164
      FROM candidates c
     GROUP BY pid, e164
    HAVING COUNT(*) > 1
  );

DROP TABLE _precheck_e3;

-- ------------------------------------------------------------
-- E3 (email) — o email não é transformado, mas o escopo do UNIQUE muda de
-- global para por-edição. Duplicata só seria possível se já houvesse duas
-- linhas com o mesmo email, o que o UNIQUE global impedia. Verificação da
-- premissa, não expectativa de falha.
-- ------------------------------------------------------------

CREATE TABLE _precheck_e4 (
  e4_nenhuma_colisao_de_email INTEGER NOT NULL
    CHECK (e4_nenhuma_colisao_de_email = 1)
);

INSERT INTO _precheck_e4
SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
  FROM (
    SELECT (SELECT sp.id FROM selection_processes sp
             WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at) AS pid,
           c.email
      FROM candidates c
     GROUP BY pid, c.email
    HAVING COUNT(*) > 1
  );

DROP TABLE _precheck_e4;

