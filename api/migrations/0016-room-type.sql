-- ============================================================
-- Migration 0016 — Classificação de sala (FEAT-0023)
--
-- Host e limite de grupos deixam de derivar da capacidade em pessoas
-- (`rooms.size`, faixas de D5) e passam a derivar da CLASSIFICAÇÃO da sala:
-- `comum` → 1 host / 2 grupos, `anfiteatro` → 2 hosts / 4 grupos
-- (`deriveRoomCapacity` em `shared/src/schemas/room.schema.ts`). Com isso
-- `size` perde qualquer consumidor e sai da tabela.
--
-- IMPACTO NOS DADOS (Princípio III): as salas existentes são convertidas,
-- não perdidas — `size > 80` (a faixa que já valia 2 hosts / 4 grupos em D5)
-- vira `anfiteatro`, o resto vira `comum`. A conversão acontece ANTES do
-- DROP, então nenhuma reclassificação manual é necessária. Uma sala de
-- 51-80 lugares (2 hosts / 3 grupos em D5) vira `comum` e passa a valer
-- 1 host / 2 grupos — a faixa intermediária deixa de existir; se alguma sala
-- assim estiver cadastrada, revisar a classificação dela na tela de salas
-- depois de aplicar.
--
-- ⚠️ `size` É DESTRUÍDA. Antes de aplicar em staging/produção, guarde o
-- mapeamento atual (`SELECT id, name, size FROM rooms`) — é a única forma de
-- reverter a classificação escolhida se ela não corresponder à realidade
-- física das salas.
--
-- POR QUE ALTER E NÃO DROP/CREATE: `groups.room_id` referencia `rooms` com
-- ON DELETE RESTRICT (migration 0014) — um `DROP TABLE rooms` com grupos
-- organizados falharia. `ALTER TABLE ... ADD/DROP COLUMN` preserva a tabela,
-- os ids e as FKs dos grupos existentes. O CHECK inline de `size` é removido
-- junto com a coluna pelo próprio SQLite (verificado antes de escrever este
-- arquivo).
--
-- O `DEFAULT 'comum'` é exigido pelo SQLite para um ADD COLUMN NOT NULL
-- sobre tabela com linhas; fica na definição da coluna, mas nenhum INSERT da
-- aplicação depende dele (`RoomsRepository` sempre envia `type`).
--
-- Sem janela de indisponibilidade: as três instruções são rápidas e a
-- release do código correspondente troca `size` por `type` de uma vez.
-- ============================================================

ALTER TABLE rooms ADD COLUMN type TEXT NOT NULL DEFAULT 'comum' CHECK (type IN ('comum', 'anfiteatro'));

UPDATE rooms SET type = 'anfiteatro' WHERE size > 80;

ALTER TABLE rooms DROP COLUMN size;
