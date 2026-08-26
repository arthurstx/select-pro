# Implementation Plan: Avaliação dos candidatos

**Branch**: `claude/feat-0013-avaliacao-candidatos` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-avaliacao-candidatos/spec.md`

## Summary

Avaliadores/hosts avaliam candidatos do próprio grupo presencial (FEAT-0012): 5 notas
(0-5) por critério fixo + 1 cor geral (RED/YELLOW/GREEN) + comentário opcional, no máximo
uma avaliação por par avaliador/candidato. O veredito do candidato (pendente/aprovado/
reprovado) é calculado a partir das avaliações recebidas — D2 (qualquer RED reprova, veto
imediato) e D6 (mínimo 2 para sair de pendente). Admin vê a lista agregada e o detalhe de
cada avaliação; avaliadores nunca veem a avaliação de outra pessoa sobre o mesmo candidato.
`evaluations`/`metrics` — órfãs desde a `0001-schema.sql` — são reconstruídas.

## Technical Context

**Language/Version**: TypeScript (mesmas versões do monorepo — Cloudflare Workers/Next 16).

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Zod, TanStack Query — nenhuma nova.

**Storage**: Cloudflare D1 — migration `0015-candidate-evaluation.sql`.

**Testing**: `vitest-pool-workers` (api) + `node:test` (lógica pura do front, se houver).

**Target Platform**: Cloudflare Workers (api) / Vercel (front).

**Project Type**: web application (monorepo).

**Performance Goals**: sem alvo dedicado — mesmo volume da FEAT-0012 (dezenas de
candidatos/avaliadores por edição).

**Constraints**: sem operação custosa (Princípio IV) — cálculo de veredito é O(n) sobre as
avaliações de um candidato (poucas unidades).

**Scale/Scope**: 4 rotas HTTP novas, 1 migration, 2 telas novas de front (avaliador e
admin).

## Constitution Check

- **I. Contrato Compartilhado**: `shared/src/schemas/evaluation.schema.ts` novo — única
  fonte dos shapes e dos pesos/critérios fixos (`deriveWeightedScore`). ✅
- **II. Spec Antes de Código**: spec aprovada pelo usuário antes deste plan. ✅
- **III. O Banco É Insubstituível**: migration `0015` reconstrói `evaluations` (vazia,
  órfã) e remove `metrics` (vazia, órfã, sem substituta) — sem filhos com dados em nenhum
  ambiente conhecido. Puramente aditiva em efeito; task de implementação confirma
  staging/produção antes de aplicar lá. ✅
- **IV. Orçamento da Plataforma**: sem operação custosa. ✅
- **V. Backend Novo Vem Com Testes**: `evaluation.service.test.ts` +
  `evaluation.routes.test.ts` planejados, cobrindo D2, D6, elegibilidade por grupo (FR-003),
  isolamento de visão (FR-005), idempotência de reenvio (FR-004). ✅

Nenhuma violação — Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/013-avaliacao-candidatos/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/evaluation-api.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
shared/src/schemas/
└── evaluation.schema.ts                  # NOVO

api/
├── migrations/
│   └── 0015-candidate-evaluation.sql     # NOVO
├── src/
│   ├── core/errors/
│   │   └── evaluation-errors.ts          # NOVO
│   ├── repositories/
│   │   └── evaluation.repository.ts      # NOVO
│   ├── services/
│   │   └── evaluation.service.ts         # NOVO — orquestra GroupRepository (FEAT-0012, reaproveitado) + evaluation.repository.ts
│   ├── routes/
│   │   └── evaluation.routes.ts          # NOVO — 4 rotas
│   └── index.ts                          # app.route("/evaluations", evaluationRouter) + CORS/maintenanceGuard (ver Achado FEAT-0012)
└── test/
    ├── evaluation.service.test.ts        # NOVO
    └── evaluation.routes.test.ts         # NOVO

front/
├── lib/evaluation/
│   ├── api.ts                            # NOVO
│   └── queries.ts                        # NOVO
└── app/painel/
    ├── minhas-avaliacoes/
    │   ├── page.tsx                      # NOVO — avaliador: lista do próprio grupo + formulário
    │   └── _components/
    │       ├── candidate-evaluation-card.tsx
    │       └── evaluation-form.tsx
    └── avaliacoes/
        ├── page.tsx                      # NOVO — admin: lista agregada + veredito
        └── _components/
            ├── verdict-badge.tsx
            └── evaluation-detail-sheet.tsx
```

**Structure Decision**: mesmo padrão de `group.*`/`member-checkin.*` (schema único em
`shared`, `repository`+`service`+`routes` em `api`, `lib/<feature>/{api,queries}.ts` +
`app/painel/<feature>/` em `front`). Duas telas de front (não uma) porque avaliador e admin
têm modelos de dado e permissões bem diferentes (FR-005/FR-009) — misturar numa tela só
exigiria esconder/mostrar blocos inteiros por papel, mais confuso que duas rotas.

⚠️ **Lição da FEAT-0012**: `/evaluations/*` precisa entrar nos blocos de `cors()` e
`maintenanceGuard()` em `api/src/index.ts` desde o início desta feature — a FEAT-0010 e a
primeira versão da FEAT-0012 esqueceram isso, e só foi descoberto em uso real (CORS error
no browser). Task dedicada nas tasks.md para não repetir.

## Complexity Tracking

*(vazio — nenhuma violação de constituição a justificar)*
