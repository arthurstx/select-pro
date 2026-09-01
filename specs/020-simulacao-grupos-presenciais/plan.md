# Implementation Plan: Simulação e regras reais de tamanho dos grupos presenciais

**Branch**: `020-simulacao-grupos-presenciais` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-simulacao-grupos-presenciais/spec.md`

## Summary

Duas partes que compartilham a mesma matemática: 1) "Simular grupos" — ação nova, só no
front, que calcula (sem persistir) quantos grupos/salas/hosts/avaliadores seriam necessários
para os candidatos presenciais presentes; 2) a organização real de grupos presenciais
(`organizePresencialGroups`) passa a respeitar de fato 3-5 candidatos por grupo, 1-2
avaliadores por grupo (priorizando 2 para grupos de 4-5), e exclui hosts do pool de
avaliadores — hoje ela não garante nenhuma dessas três coisas. As funções de cálculo entram em
`shared`, reaproveitadas pelos dois lados (Princípio I).

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**: nenhuma nova — funções puras em `shared`, sem rota HTTP nova

**Storage**: Cloudflare D1 — sem migration; a mudança é só na composição de `group_evaluators`
gravada por `organizePresencialGroups` (mesmas tabelas da FEAT-0012)

**Testing**: Vitest (`shared` + `api`) — `room.schema.test.ts` para as funções novas,
`group-organization.test.ts`/`group.service.test.ts` reescritos para as regras reais

**Target Platform**: Cloudflare Workers (api), Next.js 16 / Vercel (front)

**Project Type**: web application (monorepo)

**Performance Goals**: nenhuma nova — funções puras O(n) sobre poucas dezenas de
candidatos/avaliadores

**Constraints**: 10 ms CPU/invocação — sem risco, mesma classe de operação da FEAT-0012

**Scale/Scope**: 3 funções novas em `shared/src/schemas/room.schema.ts`; reescrita de
`organizePresencialGroups` (distribuição de avaliadores muda de "balanceada" para "por
prioridade de alvo", tamanho de grupo passa a ser calculado, não só limitado pela sala); 1
botão novo + 1 card de resultado no front

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ `derivePresencialGroupCount`/`deriveEvaluatorTargetForGroupSize`/`recommendRoomsForGroups` em `shared`, únicas donas dessa matemática — front (simulação) e api (organização real) consomem as mesmas. |
| II. Spec antes de código | ✅ `spec.md` aprovada (escopo confirmado com o usuário) antes deste plan. |
| III. Banco insubstituível | ✅ Sem migration — muda só a composição de linhas já gravadas hoje pelo mesmo fluxo (FEAT-0012). |
| IV. Orçamento de plataforma | ✅ Sem operação de CPU nova; funções puras, síncronas. |
| V. Backend com testes | ✅ `group-organization.test.ts`/`group.service.test.ts` reescritos; `room.schema.test.ts` (shared) ganha casos novos. |

Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/020-simulacao-grupos-presenciais/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/no-new-endpoint.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
shared/src/schemas/
└── room.schema.ts   # + derivePresencialGroupCount, deriveEvaluatorTargetForGroupSize,
                      # recommendRoomsForGroups (mesmo arquivo de deriveRoomCapacity/D5)

shared/src/schemas/
└── room.schema.test.ts   # + testes das 3 funções novas

api/src/services/
└── group-organization.ts   # organizePresencialGroups: candidateSlots calculados via
                             # derivePresencialGroupCount (não mais = maxGroups da sala fixo);
                             # distribuição de avaliadores vira distributeEvaluatorsByTarget
                             # (nova função, substitui distributeEvaluatorsAcrossNonEmptySlots
                             # pro caminho presencial), só sobre presentMembers filtrado por
                             # role === "avaliador"

api/test/
├── group-organization.test.ts  # reescrito: tamanho 3-5, alvo 1/2 por avaliador, host excluído
└── group.service.test.ts       # + casos com D1 real cobrindo as regras novas

front/app/painel/grupos/_components/
├── simulate-button.tsx   # NOVO — botão "Simular grupos", busca totalCandidates presencial
│                          # presente (GET /candidates?attendance=presencial&status=presentes)
│                          # e calcula com as funções de shared, mostra resultado num Sheet/card
└── groups-view.tsx        # + <SimulateButton /> ao lado do OrganizeButton (só na tela presencial)
```

**Structure Decision**: matemática nova concentrada em `shared` (mesmo padrão de
`deriveRoomCapacity`), consumida por uma reescrita cirúrgica do algoritmo já existente
(`organizePresencialGroups`) e por um componente novo e independente no front (não mexe em
`organizeOnlineGroups`, fora de escopo desta feature).

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
