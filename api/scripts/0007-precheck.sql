-- ============================================================
-- Pré-checagem da migration 0007 (FEAT-0006, seção 4.1)
--
-- NÃO é uma migration. Fica fora de `migrations/` de propósito: é só
-- leitura, e precisa poder rodar quantas vezes for preciso, em qualquer
-- ambiente, sem entrar no controle de versão do D1.
--
--   npx wrangler d1 execute <DB> --env staging --remote --file scripts/0007-precheck.sql
--
-- AS TRÊS CONSULTAS PRECISAM VIR VAZIAS. Qualquer linha devolvida é uma
-- correção manual a ser feita ANTES de aplicar a 0007 — a migration do D1
-- não é transacional, então descobrir isso durante a execução deixaria
-- `candidates` já dropada e os dados nas tabelas `_bkp_*`.
-- ============================================================

-- ------------------------------------------------------------
-- E1 — telefones que não normalizam para E.164
--
-- Reconhecidos: 13 dígitos começando em 55, ou 10/11 dígitos (fixo/celular).
-- Qualquer outro tamanho não tem regra e precisa de decisão humana.
-- ------------------------------------------------------------
WITH normalizado AS (
  SELECT id, name, phone,
         replace(replace(replace(replace(replace(replace(
           phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', ''), '.', '') AS digitos
    FROM candidates
)
SELECT 'E1: telefone nao normalizavel' AS problema, id, name, phone, digitos, length(digitos) AS tamanho
  FROM normalizado
 WHERE NOT (
   (length(digitos) = 13 AND substr(digitos, 1, 2) = '55')
   OR length(digitos) IN (10, 11)
 );

-- ------------------------------------------------------------
-- E2 — candidatos cujo created_at não cai em nenhuma edição
--
-- Quebrariam o `process_id NOT NULL` da tabela nova. A correção provável é
-- cadastrar a edição faltante em `selection_processes`, não relaxar a
-- constraint (seção 10, pergunta 7).
-- ------------------------------------------------------------
SELECT 'E2: fora de toda janela de edicao' AS problema, c.id, c.name, c.created_at
  FROM candidates c
 WHERE NOT EXISTS (
   SELECT 1 FROM selection_processes sp
    WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at
 );

-- ------------------------------------------------------------
-- E3 — colisões CRIADAS pela normalização
--
-- A mais importante das três, e a única que não dá para descobrir lendo o
-- código: hoje `(71) 98888-7777` e `71988887777` são linhas distintas que
-- passam pelo UNIQUE (a comparação é de string exata). Normalizados, os
-- dois viram o mesmo valor e violam `UNIQUE (process_id, phone)`.
-- ------------------------------------------------------------
WITH normalizado AS (
  SELECT c.id, c.name, c.email,
         (SELECT sp.id FROM selection_processes sp
           WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at) AS process_id,
         CASE
           WHEN length(d.digitos) = 13 AND substr(d.digitos, 1, 2) = '55' THEN '+' || d.digitos
           WHEN length(d.digitos) IN (10, 11)                            THEN '+55' || d.digitos
         END AS telefone_e164
    FROM candidates c
    JOIN (
      SELECT id,
             replace(replace(replace(replace(replace(replace(
               phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', ''), '.', '') AS digitos
        FROM candidates
    ) d ON d.id = c.id
)
SELECT 'E3: colisao de telefone na mesma edicao' AS problema,
       process_id, telefone_e164, COUNT(*) AS linhas, group_concat(id) AS ids
  FROM normalizado
 GROUP BY process_id, telefone_e164
HAVING COUNT(*) > 1;

-- E3 (email) — o email não é transformado, mas o escopo do UNIQUE muda de
-- global para por-edição. Duplicata só é possível se já houvesse duas linhas
-- com o mesmo email, o que o UNIQUE global impedia — então esta consulta
-- deve ser vazia por construção. Está aqui como verificação da premissa.
SELECT 'E3: colisao de email na mesma edicao' AS problema,
       (SELECT sp.id FROM selection_processes sp
         WHERE c.created_at BETWEEN sp.starts_at AND sp.ends_at) AS process_id,
       c.email, COUNT(*) AS linhas
  FROM candidates c
 GROUP BY process_id, c.email
HAVING COUNT(*) > 1;
