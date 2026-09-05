# Implementation Plan: Cobertura de avaliadores nos grupos presenciais

**Branch**: `025-cobertura-de-avaliadores` | **Date**: 2026-09-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/025-cobertura-de-avaliadores/spec.md`

## Summary

Grupos presenciais podem sair da organização automática **sem nenhum avaliador**, e avaliadores presentes podem ficar **sem grupo nenhum** — os dois lados do mesmo defeito: a quantidade de grupos é decidida só por candidatos e capacidade de sala, e a distribuição de avaliadores depois se vira com o que sobrar, abortando em silêncio nas duas passadas.

A abordagem **não muda o algoritmo de distribuição**. Ela torna o resultado classificável e visível: um estado novo `sem_avaliador` no `shared` obriga (via compilador) prévia e card real a tratar o caso; a aprovação com grupo descoberto passa por confirmação nomeada; quem ficou de fora vira lista com ação de troca; e a escrita recusa quando não há avaliador nenhum. No backend, a atribuição de avaliador deixa de ser exclusiva do online, e a troca de host ganha primitiva própria — porque a primitiva existente colapsaria o host num grupo só.

## Technical Context

**Language/Version**: TypeScript 5

**Primary Dependencies**: `api/` Hono + `@hono/zod-openapi`; `front/` Next.js 16 (App Router) + React 19 + TanStack Query v5 + Tailwind v4; `shared/` Zod 3

**Storage**: Cloudflare D1 — tabelas `groups`, `group_evaluators`, `rooms`, `member_checkins`. **Sem migration nesta feature.**

**Testing**: `vitest-pool-workers` no `api/`; `node --test` no `shared/` e no `front/`

**Target Platform**: Cloudflare Workers (api) + Vercel (front)

**Project Type**: monorepo npm workspaces — `front/`, `api/`, `shared/`

**Performance Goals**: N/A — escala de uma edição é de dezenas de candidatos e poucas salas. Todo cálculo novo é `O(grupos)` em memória.

**Constraints**: 10 ms de CPU por invocação (Princípio IV). Não acionado: o trabalho novo por requisição é aritmética sobre dezenas de itens mais `batch` de D1, que é I/O e não conta.

**Scale/Scope**: 3 arquivos novos de teste, ~8 arquivos tocados, 9 requisitos funcionais.

## Constitution Check

*GATE: avaliado antes da Fase 0 e reavaliado após a Fase 1.*

| Princípio | Status | Justificativa |
|---|---|---|
| **I — Contrato compartilhado** | ✅ Passa | O código de erro (`NO_EVALUATORS_PRESENT`) e a regra de classificação (`classifyPresencialGroup`) vivem em `shared/src/schemas/group.schema.ts` e `room.schema.ts`, importados pelos dois lados. Nenhum DTO local, nenhuma validação reescrita no front. A alternativa de calcular a cobertura no front foi rejeitada por este princípio (`research.md`, Decisão 3). |
| **II — Spec antes de código** | ✅ Passa | Spec escrita, clarificada em 5 pontos com aprovação humana, e corrigida por este plano (FR-008, Decisão 6) antes de qualquer código. |
| **III — O banco é insubstituível** | ✅ Não acionado | Nenhuma migration. Nenhuma tabela muda de shape; nenhum dado gravado é reinterpretado. A alternativa que exigiria migration destrutiva (reintroduzir `UNIQUE(user_id)`) foi rejeitada explicitamente (`research.md`, Decisão 2). Sem janela de manutenção. |
| **IV — Orçamento da plataforma** | ✅ Passa | Sem KV, sem cron, sem regra nova de rate limiting. Os N ajustes manuais do FR-009 são invocações independentes — o teto de 10 ms é por invocação e não acumula; o paralelismo real é limitado pelo navegador. Queues (indisponível no Free) não é necessário. Detalhado em `research.md`, Decisão 4. |
| **V — Backend novo vem com testes** | ✅ Passa | Rota alterada e service alterado entregam teste junto, no padrão de `api/test/`: `group.service.test.ts` (regra), `group.routes.test.ts` (contrato HTTP) e `group-organization.test.ts` (algoritmo puro). Ver `quickstart.md`. |

**Resultado**: nenhuma violação. A tabela de Complexity Tracking fica vazia.

**Reavaliação pós-Fase 1**: os artefatos de design não introduziram violação. A Decisão 2 (`replaceRoomHost`) foi tomada justamente para **evitar** acionar o Princípio III, e a Decisão 6 corrigiu um requisito que teria produzido uma resposta de erro carregando payload de sucesso — o que violaria o envelope do Princípio I.

## Project Structure

### Documentation (this feature)

```text
specs/025-cobertura-de-avaliadores/
├── spec.md              # Requisitos (com Clarifications)
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — 6 decisões técnicas
├── data-model.md        # Fase 1 — estados e efeito em group_evaluators
├── contracts/
│   └── groups-evaluators.md
├── quickstart.md        # Fase 1 — validação end-to-end
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/src/schemas/
├── room.schema.ts               # classifyPresencialGroup ganha "sem_avaliador"
├── room.schema.test.ts          # cobre o estado novo
└── group.schema.ts              # GroupErrorCode.NO_EVALUATORS_PRESENT

api/src/
├── core/errors/group-errors.ts  # NoEvaluatorsPresentError
├── repositories/group.repository.ts   # replaceRoomHost (novo)
├── services/group.service.ts    # recusa no organize; assign deixa de ser online-only
└── routes/group.routes.ts       # PUT /{groupId}/evaluators/{userId}; remover-por-admin

api/test/
├── group-organization.test.ts   # cobertura parcial e excedente
├── group.service.test.ts        # FR-008
└── group.routes.test.ts         # FR-005, FR-008

front/app/painel/grupos/_components/
├── simulate-organize-modal.tsx  # FR-001..004, FR-007..009
└── group-card.tsx               # FR-006
```

**Structure Decision**: monorepo já existente, sem diretório novo. A ordem de implementação segue o Princípio II — `shared/` primeiro, depois `api/`, depois `front/` — e não é negociável aqui, porque o estado `sem_avaliador` no `shared` é justamente o que faz o compilador apontar os pontos do front que precisam mudar.

## Complexity Tracking

*Constitution Check passou sem violações — nada a justificar.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Riscos

- **Trocar um host com a primitiva errada é um bug silencioso.** `assignEvaluator` colapsaria o host num grupo só, e a organização das outras salas perderia o host sem nenhum erro. Mitigação: `replaceRoomHost` dedicada (`research.md`, Decisão 2) e o cenário C3 do `quickstart.md` como teste manual obrigatório.
- **Mover o path da rota de atribuição** (`/groups/online/{id}/evaluators/{id}` → `/groups/{id}/evaluators/{id}`) quebra qualquer chamador que não seja o front deste repo. Levantamento feito: só `front/lib/group/api.ts:114` consome. Sem consumidor externo.
- **FR-009 corrige um defeito que hoje mente para o operador.** Enquanto não for implementado, uma falha de rede nos ajustes segue dizendo que a organização não foi gravada, quando foi.
