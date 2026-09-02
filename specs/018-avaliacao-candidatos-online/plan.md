# Implementation Plan: Prosel online — grupos e avaliação independentes do presencial

**Branch**: `018-avaliacao-candidatos-online` | **Date**: 2026-09-01 (revisado) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-avaliacao-candidatos-online/spec.md`

## Summary

Fecha o mesmo buraco funcional da versão anterior desta spec (candidato online nunca
avaliado), mas com o modelo correto: presencial e online são operações **independentes**
(dias diferentes, pessoas diferentes), não um pool único. `GroupRepository.replaceOrganization`
passa a ser escopado por `modality`, evitando que organizar uma modalidade apague a outra —
esse era um bug real e pré-existente, exposto pela reformulação. A organização automática de
grupos online passa a formar só candidatos (sem sala/avaliador/host); o vínculo
avaliador↔grupo online nasce exclusivamente por ação humana: self-service (o avaliador clica
"Participar") ou atribuição manual do admin. Sem host no online — a distinção host/avaliador
vira uma regra de leitura condicionada à modalidade. Front ganha duas seções separadas
("Grupos Online" / "Grupos Presenciais"), cada uma com sua própria ação de organizar, e o card
de grupo online ganha os botões "Participar"/"Sair".

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**: Hono + `@hono/zod-openapi` (2 rotas novas + 1 rota dividida em 2 +
1 rota com comportamento estendido), Zod (sem schema novo — mesmos schemas de FEAT-0012)

**Storage**: Cloudflare D1 — sem migration, muda o escopo do `DELETE` em
`replaceOrganization` e a condição da derivação de `role` na leitura

**Testing**: Vitest + `@cloudflare/vitest-pool-workers` — `group-organization.test.ts`/
`group.service.test.ts`/`group.routes.test.ts` reescritos onde a API pública muda; testes
novos para join/leave/assign (Princípio V)

**Target Platform**: Cloudflare Workers (api), Next.js 16 / Vercel (front)

**Project Type**: web application (monorepo)

**Performance Goals**: nenhuma nova

**Constraints**: 10 ms CPU/invocação — sem risco, mesmas operações de I/O simples já
existentes

**Scale/Scope**: `group-organization.ts` dividido em 2 funções puras independentes;
`group.repository.ts` — `replaceOrganization` ganha parâmetro `modality`, `listEvaluatorAllocations`
ganha condição de modalidade; `group.service.ts` — `organize()` vira
`organizePresencial()`/`organizeOnline()`, `moveEvaluator()` ganha o caso "sem origem, destino
online", + `joinOnlineGroup()`/`leaveOnlineGroup()`; `group.routes.ts` — 2 rotas novas
(`POST /groups/online/{id}/join`, `DELETE /groups/online/me`), `POST /groups/organize` dividida
em `/organize/presencial` e `/organize/online`; front — duas seções + botões de
participar/sair

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ Nenhum schema muda de shape — `GroupSummarySchema`/`OrganizeResultResponseSchema`/`MoveResultResponseSchema` já existem e servem para as rotas novas sem alteração. |
| II. Spec antes de código | ✅ `spec.md` reescrita e aprovada (o usuário corrigiu a premissa antes de qualquer commit) antes deste plan. |
| III. Banco insubstituível | ✅ Sem migration — só muda o escopo de um `DELETE` já existente e a condição de uma query de leitura. |
| IV. Orçamento de plataforma | ✅ Sem operação de CPU nova. |
| V. Backend com testes | ✅ Testes reescritos/novos cobrindo organize por modalidade, join/leave/assign, e a condição de `role`. |

Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/018-avaliacao-candidatos-online/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/groups-online.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
api/src/services/
└── group-organization.ts   # REESCRITO — organizePresencialGroups (era organizePresencial,
                             # sem mudança de lógica) e organizeOnlineGroups (candidatos +
                             # D1, sem avaliador) como duas funções independentes; sem função
                             # "organizeGroups" combinadora

api/src/repositories/
└── group.repository.ts     # replaceOrganization(processId, modality, groups) — DELETE
                             # escopado por modality; listEvaluatorAllocations(ForGroup) —
                             # role só deriva de edition_hosts quando g.modality =
                             # 'presencial'; + assignEvaluator(userId, groupId) via
                             # INSERT ... ON CONFLICT(user_id) DO UPDATE (usa o UNIQUE já
                             # existente) e removeEvaluator(userId)

api/src/services/
└── group.service.ts        # organize() dividido em organizePresencial()/organizeOnline();
                             # moveEvaluator() SEM mudança; + assignEvaluatorToOnlineGroup
                             # (usado por join self-service e pelo PUT admin) e
                             # leaveOnlineGroup(userId)

api/src/core/errors/
└── group-errors.ts         # revisar se algum erro novo é necessário (ex.: reaproveitar
                             # GroupModalityMismatchError/EvaluatorNotAllocatedError já
                             # existentes — sem classe nova esperada)

api/src/routes/
└── group.routes.ts         # POST /organize/presencial, POST /organize/online (substituem
                             # POST /organize); POST /online/{groupId}/join,
                             # DELETE /online/me (novas, requireRole(AVALIADOR) — não admin);
                             # PUT /online/{groupId}/evaluators/{userId} (nova, admin, US3);
                             # PATCH .../evaluators/{userId} sem nenhuma mudança

api/src/index.ts            # CORS de /groups/* já cobre POST/PATCH/GET — confirmar que
                             # DELETE está no allowMethods (hoje só GET/POST/PATCH)

api/test/
├── group-organization.test.ts  # reescrito para as 2 funções separadas
├── group.service.test.ts       # + organize por modalidade escopado, join/leave/assign
└── group.routes.test.ts        # + rotas novas, rota dividida, PATCH estendido

front/app/painel/grupos/
├── page.tsx                          # duas seções ("Grupos Online"/"Grupos Presenciais"),
│                                       # dois botões de organizar
└── _components/
    ├── group-card.tsx                # botão "Participar"/"Sair" no card online
    └── (queries em front/lib/group/queries.ts) # + useJoinOnlineGroup/useLeaveOnlineGroup
```

**Structure Decision**: mesma arquitetura em camadas já usada (rota → service → repository),
sem domínio novo — só divide o que hoje é uma operação conjunta em duas independentes, e
adiciona duas rotas de self-service com autorização diferente (avaliador, não admin) das
demais rotas de `/groups`.

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
