-- ============================================================
-- Migration 0009 — Unicidade de nome de sala (FEAT-0011)
--
-- ⚠️ NUMERAÇÃO: pressupõe que a FEAT-0008 (0008-signup-requests.sql, branch
-- feat/status-membro-aprovacao) mescla em `develop` ANTES desta feature.
-- Se a ordem de merge inverter, renumerar esta migration para 0008 e a da
-- 008 para 0009 antes de aplicar em qualquer ambiente compartilhado.
--
-- SEGURANÇA DESTA MIGRATION: puramente aditiva — um índice único sobre uma
-- tabela vazia (`rooms` está órfã desde a 0001, nenhum código a usa até
-- agora). Sem ALTER/DROP, dispensa MAINTENANCE_MODE (Princípio III).
-- ============================================================

CREATE UNIQUE INDEX idx_rooms_name ON rooms(name);
