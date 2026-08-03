-- ============================================================
-- Migration 0003 — Texto livre de "Como conheceu" (FEAT-0001 v3.0)
--
-- A opção `outros` de `referral_source` passou a exigir uma descrição
-- escrita pelo candidato (FEAT-0001 v3.0, seção 8.2) — sem ela, `outros`
-- acumula respostas sem informação alguma, justamente a resposta que o
-- time precisa ler para descobrir canais de divulgação não mapeados.
--
-- Nullable de propósito: a coluna só tem valor quando
-- `referral_source = 'outros'`. A regra "obrigatório em outros, null nas
-- demais" é garantida pelo schema Zod compartilhado (validação) e pela
-- normalização no service (persistência) — não por CHECK cruzado entre
-- colunas, que o SQLite não permite adicionar via ALTER TABLE.
--
-- Linhas existentes (inscrições feitas antes desta migration) ficam com
-- NULL mesmo em `outros`; é o registro fiel de que a pergunta não existia
-- quando elas foram criadas.
-- ============================================================

ALTER TABLE candidate_applications ADD COLUMN referral_source_other TEXT;
