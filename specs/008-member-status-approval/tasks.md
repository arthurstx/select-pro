---

description: "Task list for 008 — Status de membro e aprovação de cadastro"
---

# Tasks: Status de membro e aprovação de cadastro

**Input**: Design documents from `/specs/008-member-status-approval/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/signup-requests.md, quickstart.md

**Tests**: NÃO opcionais nesta feature — Princípio V da constitution exige
`<feature>.service.test.ts` + `<feature>.routes.test.ts` para toda rota/service
novo no `api/`. Incluídos em cada fase de backend.

**Organization**: por user story (spec.md), na ordem `shared/` → `api/` →
`front/` dentro de cada fase, conforme o Fluxo de Desenvolvimento da
constitution.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1, US2 ou US3 — mapeia para spec.md
- Setup/Foundational/Polish: sem label de story

## Path Conventions

Monorepo: `shared/src/`, `api/src/` + `api/test/`, `front/app/`.

---

## Phase 1: Setup (contratos compartilhados)

**Purpose**: mudança de domínio que toda fase seguinte depende — `shared/`
primeiro, por regra da constitution (Princípio I e II).

- [X] T001 Atualizar `MemberStatus` para `"active" | "inactive" | "trainee"` em `shared/src/schemas/database.schema.ts` (D3 — remove `alumni`/`on_leave`)
- [X] T002 Em `shared/src/schemas/member.schema.ts`: reduzir `MemberStatusSchema` a 3 valores; substituir `ELIGIBLE_MEMBER_STATUSES`/`isEligibleMemberStatus` por `RECOGNIZED_MEMBER_STATUSES`/`isRecognizedMemberStatus`; adicionar `requiresApproval(status)` e `isEligibleToAnchorTrainee(status)` (R5 — nomes exatos do data-model.md)
- [X] T003 [P] Em `shared/src/schemas/auth.schema.ts`: adicionar `SignupRequestStatusSchema`, `SignupRequestSummarySchema`, `SignupRequestDetailSchema`, `SignupRequestListResponseSchema`, `SignupRequestDetailResponseSchema`, `SignupDecisionSchema`, `RegisterPendingResponseSchema` (schemas exatos em data-model.md)
- [X] T004 [P] Em `shared/src/schemas/auth.schema.ts`: adicionar `SIGNUP_REQUEST_NOT_FOUND`, `SIGNUP_REQUEST_EXPIRED`, `SIGNUP_REQUEST_ALREADY_DECIDED` a `AuthErrorCode`
- [X] T005 Atualizar o único call site de `isEligibleMemberStatus` em `api/src/services/auth.service.ts:116` para `isRecognizedMemberStatus` (só a chamada — a bifurcação por `requiresApproval` é T012, US1)

**Checkpoint**: `shared` builda (`npm run build --workspace=shared` ou equivalente) sem erro de tipo. Nenhum consumidor de `ELIGIBLE_MEMBER_STATUSES`/`isEligibleMemberStatus` deve sobrar — confirmado por T005 ser o único ponto encontrado na exploração do plan.

---

## Phase 2: Foundational (bloqueante para as 3 user stories)

**Purpose**: banco, erros de domínio e envio de e-mail — nenhuma user story
funciona sem isso.

**⚠️ CRITICAL**: nenhuma tarefa de US1/US2/US3 começa antes desta fase.

- [X] T006 Criar `api/migrations/0008-signup-requests.sql` com `signup_requests`, `signup_approval_tokens` e os 3 índices (schema exato em data-model.md) — aditiva, sem `MAINTENANCE_MODE` (Constitution Check do plan.md)
- [X] T007 Aplicar a migration localmente (`wrangler d1 migrations apply <DB> --local`) — **staging/produção movidos para T039** (correção pós-`/speckit-analyze`, achado I3: T007 e T039 duplicavam a aplicação em staging)
- [X] T008 [P] Adicionar `SignupRequestNotFoundError`, `SignupRequestExpiredError`, `SignupRequestAlreadyDecidedError` em `api/src/core/errors/auth-errors.ts` (mesmo padrão das classes existentes — code + field opcional + message)
- [X] T009 [P] Criar `api/src/repositories/signup-requests.repository.ts`: `create`, `findPendingByEmail`, `findById`, `findByTokenHash` (join com `signup_approval_tokens`), `listByStatus`, `countRejectedByEmail`, `decide` (`UPDATE ... WHERE id = ? AND status = 'pending' RETURNING *` de R4 — `null` de volta = já decidida ou não existe, o service distingue via `findById` prévio)
- [X] T010 [P] Em `api/src/repositories/auth.repository.ts`: adicionar `createApprovedMemberAccount(newUser, newProfile)` — mesma lógica de `createMemberAccount` porém **sem** criar `sessions` (a conta aprovada não recebe sessão automática, R1)
- [X] T011 [P] Em `api/src/lib/mailer.ts`: adicionar `sendSignupApprovalRequest({ to, memberName, memberStatusLabel, reviewUrl })` e `sendSignupDecisionResult({ to, approved })` à interface `Mailer` e à implementação `ResendMailer` (refatorado um `send()` privado comum — mesmo texto simples, sem HTML)
- [X] T011b Registrar `SIGNUP_APPROVAL_EMAIL` em `api/wrangler.jsonc` (raiz + `env.staging`) e regenerar `worker-configuration.d.ts` via `cf-typegen` — correção pós-`/speckit-analyze`, achado E1 (FR-020 exige endereço configurável, não hardcoded)
- [X] T011c Adicionar `SignupRequestRow`/`SignupApprovalTokenRow`/`NewSignupRequest`/`NewSignupApprovalToken`/`SignupRequestStatus` a `shared/src/schemas/database.schema.ts` e ao mapa `DatabaseSchema` — necessário para T009 tipar o repository, não estava explícito no data-model.md original

**Checkpoint**: migration aplicada localmente, repositórios e mailer compilam. Nenhuma rota ainda expõe isso.

---

## Phase 3: User Story 1 - Pós-júnior e trainee conseguem solicitar cadastro (Priority: P1) 🎯 MVP

**Goal**: `POST /auth/register` bifurca por `requiresApproval(member.status)` — `active` continua como está; `inactive`/`trainee` grava `signup_requests` e responde 202, sem criar conta.

**Independent Test**: os 3 primeiros cenários do `quickstart.md` — `active` continua 201, `inactive`/`trainee` vira 202 sem linha em `users`, repetir a chamada não duplica a solicitação (FR-016).

### Tests for User Story 1

- [X] T012 [P] [US1] `signup-requests.service.test.ts`: `create()` grava a solicitação com o snapshot correto; chamada repetida com solicitação `pending` existente não insere segunda linha nem despacha e-mail (R3) — `api/test/signup-requests.service.test.ts`
- [X] T013 [P] [US1] Atualizar `auth.service.test.ts` (`api/test/auth.service.test.ts`): `register()` com membro `active` continua 201 com sessão (regressão); com `inactive`/`trainee` retorna a resposta de pendência e **não** grava `users`/`sessions`
- [X] T014 [P] [US1] Atualizar `auth.routes.test.ts` (`api/test/auth.routes.test.ts`): `POST /auth/register` devolve `202` `RegisterPendingResponseSchema` para `inactive`/`trainee`, `201` inalterado para `active`

### Implementation for User Story 1

- [X] T015 [US1] Criar `api/src/services/signup-requests.service.ts`: `create(member, email, passwordHash)` — consulta `findPendingByEmail` antes de inserir (R3), gera token opaco (`generateOpaqueToken`/`hashOpaqueToken`, 7 dias — mesmo padrão de `RESET_TOKEN_TTL_SECONDS`), grava `signup_approval_tokens`, despacha `sendSignupApprovalRequest` via `defer()` (nunca rejeita — mesmo padrão de `dispatchPasswordReset`) (depende de T009, T011)
- [X] T016 [US1] Em `api/src/services/auth.service.ts`, `register()`: após confirmar que é membro reconhecido (T005), ramificar por `requiresApproval(member.status)` — se `true`, delegar a `SignupRequestsService.create()` e retornar a resposta de pendência em vez de criar `users`/sessão (depende de T015). Retorno virou `Either<RegisterError, RegisterResult>` com `RegisterResult = {kind:"session",session} | {kind:"pending_approval"}` — mudança de shape não prevista no plan.md original, necessária para o TS distinguir os dois casos sem checagem frágil de campo.
- [X] T017 [US1] Injetar `SignupRequestsService` em `AuthServiceDeps` e compor no `buildService()` de `api/src/routes/auth.routes.ts`, junto dos demais deps. `buildSignupRequestsService(c)` extraído como função exportada (reaproveitada por `signup-requests.routes.ts`, T026)
- [X] T018 [US1] Atualizar `registerRoute` em `api/src/routes/auth.routes.ts`: documentar a resposta `202` (`RegisterPendingResponseSchema`) na definição OpenAPI, ao lado do `201` existente
- [X] T019 [US1] [P] Criar `front/app/(auth)/cadastro-em-analise/page.tsx` — tela "Cadastro em análise" (mockup já gerado no Stitch: "Cadastro em Análise - CIMATEC Jr"), roteada quando `POST /auth/register` responde `202`
- [X] T020 [US1] Em `front/app/(auth)/cadastro/register-form.tsx`, tratar a resposta `202` do submit redirecionando para `/cadastro-em-analise` em vez do fluxo de login automático (depende de T019). Cadeia completa: `registerMember()` bifurca pelo `status` HTTP antes do parse Zod (202 não pode cair no schema de sessão) → `signUp()` retorna `{pending: boolean}` → form decide a rota.

**Checkpoint**: US1 funcional e testável isoladamente — cadastro de `inactive`/`trainee` vira pendência visível só via banco/logs (a fila do admin é US3). `npm run test --workspace=api` passa.

---

## Phase 4: User Story 2 - Admin decide a solicitação a partir do e-mail (Priority: P1)

**Goal**: leitura pública por token (`GET .../by-token/:token`) sem decidir nada; decisão (`POST .../:id/decision`) exige admin autenticado (R2); transição atômica evita decisão dupla (R4).

**Independent Test**: cenários 3, 4 e 5 do `quickstart.md` — abrir o link não muda estado; decidir sem `Authorization` dá 401; decidir duas vezes a mesma solicitação dá 409 na segunda.

### Tests for User Story 2

- [X] T021 [P] [US2] `signup-requests.service.test.ts`: `getByToken()` nunca muda `status`; token expirado (>7 dias) retorna `SignupRequestExpiredError`; token inexistente retorna `SignupRequestNotFoundError`
- [X] T022 [P] [US2] `signup-requests.service.test.ts`: `decide()` aprovando cria `users`+`member_profiles` via `createApprovedMemberAccount` **sem** sessão, grava `decided_by`/`decided_at`; recusando só grava a decisão; decidir uma solicitação já decidida retorna `SignupRequestAlreadyDecidedError` (R4)
- [X] T023 [P] [US2] `signup-requests.routes.test.ts` (novo, `api/test/signup-requests.routes.test.ts`): `GET .../by-token/:token` sem `Authorization` responde 200; `POST .../:id/decision` sem `Authorization` responde 401; com admin autenticado responde 204 e persiste a decisão

### Implementation for User Story 2

- [X] T024 [US2] Em `signup-requests.service.ts`: `getByToken(token)` — resolve hash, checa expiração, retorna `SignupRequestDetailSchema` (depende de T009)
- [X] T025 [US2] Em `signup-requests.service.ts`: `decide(id, adminUserId, decision)` — `UPDATE` atômico (R4); se aprovado, chama `createApprovedMemberAccount`; despacha `sendSignupDecisionResult` via `defer()` para o solicitante (depende de T024, T010)
- [X] T026 [US2] Criar `api/src/routes/signup-requests.routes.ts`: `GET /auth/signup-requests/by-token/:token` **sem** middleware de auth; `POST /auth/signup-requests/:id/decision` com `[requireAuth, requireRole(ROLES.ADMIN)]` (contrato exato em contracts/signup-requests.md) (depende de T025)
- [X] T027 [US2] Montar `signupRequestsRouter` em `api/src/index.ts` sob `/auth/signup-requests`, ao lado de `authRouter`
- [X] T028 [US2] [P] Criar `front/app/(auth)/solicitacoes/[token]/page.tsx` — tela de decisão (mockup Stitch "Confirmação de Acesso"), **com gate de login** antes de habilitar Aprovar/Recusar (R2 — este é o ponto onde o mockup atual precisa de revisão, ver research.md). `page.tsx` (server, `params` é Promise no Next 16) + `signup-decision-screen.tsx` (client): leitura sempre pública via TanStack Query; card de decisão só habilita Aprovar/Recusar quando `useAuth().user?.role === ROLES.ADMIN`, senão mostra prompt de login. Escopo consciente: sem `returnTo` pós-login (infra nova, não pedida) — o admin decide de novo a partir do painel ou reabrindo o link.
- [X] T029 [US2] Em `signup-decision-screen.tsx`: 404 (`SIGNUP_REQUEST_NOT_FOUND`/`SIGNUP_REQUEST_EXPIRED`) mostra estado "link inválido" distinto; `status !== "pending"` (US2 cenário 4) mostra "já resolvida" sem botões — três estados textuais, não rotas separadas

**Checkpoint**: US2 funcional e testável isoladamente — um link de e-mail simulado leva à decisão, gated por login. Combinado com US1, o ciclo cadastro→decisão fecha ponta a ponta.

---

## Phase 5: User Story 3 - Fila de solicitações no painel (Priority: P2)

**Goal**: admin lista e decide pendências direto no painel, sem depender do e-mail.

**Independent Test**: com `MEMBER_DIRECTORY_BYPASS=true`, criar 2-3 solicitações pendentes e decidir todas pela fila, sem nunca chamar `.../by-token/:token`.

### Tests for User Story 3

- [X] T030 [P] [US3] `signup-requests.routes.test.ts`: `GET /auth/signup-requests?status=pending` sem `Authorization` responde 401; com admin responde 200 e a lista bate com as pendências gravadas; com usuário `avaliador` (não-admin) responde 403
- [X] T031 [P] [US3] `signup-requests.service.test.ts`: `list(status)` inclui `priorRejectionCount` correto (conta solicitações `rejected` anteriores do mesmo email — FR-019)

### Implementation for User Story 3

- [X] T032 [US3] Em `signup-requests.service.ts`: `list(status)` — join/contagem de `priorRejectionCount` por email (depende de T009)
- [X] T033 [US3] Adicionar `GET /auth/signup-requests` a `signup-requests.routes.ts` com `[requireAuth, requireRole(ROLES.ADMIN)]` (depende de T032, reusa o router de T026)
- [X] T034 [US3] [P] Criar `front/app/painel/solicitacoes/page.tsx` — fila do admin (mockup Stitch "Solicitações de Cadastro"), consumindo `GET /auth/signup-requests` e reutilizando a ação de decisão de US2 (aprovar/recusar direto na linha). Chips de status (mesmo padrão de `check-in/_components/filters-bar.tsx`) em vez de um componente `Tabs` novo — o design system do projeto não tem esse componente instalado, e chips já é a convenção existente para filtro de status.
- [X] T035 [US3] Adicionar item "Solicitações" à navegação do painel (`components/painel/painel-nav.tsx`) — ícone `UserCheckIcon`, mesmo padrão dos dois itens existentes (rota real, sem guard de papel no menu — a barreira é a API)

**Checkpoint de backend**: 245/245 testes passando na suíte inteira do `api` (`npm run test --workspace=api`), zero regressão.

**Checkpoint de frontend**: `npx tsc --noEmit` limpo em `front/` e `api/`; `npm run build --workspace=front` (Next.js production build) gerou as 4 rotas novas sem erro — `/cadastro-em-analise` e `/painel/solicitacoes` estáticas, `/solicitacoes/[token]` dinâmica; `eslint` sem warnings nos arquivos novos.

**As 6 tarefas de `front/` (T019, T020, T028, T029, T034, T035) estão completas.**

**Checkpoint**: as 3 user stories funcionam de ponta a ponta, isoladamente e em conjunto. `npm run test --workspace=api` cobre as 3.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T036 [P] Rodar o quickstart.md completo (6 cenários) contra `wrangler dev` local com `MEMBER_DIRECTORY_BYPASS=true`
- [ ] T037 [P] Revisar o mockup Stitch "Confirmação de Acesso" para incluir o estado de gate de login (pendência registrada em research.md R2) — atualizar o protótipo, não só o código
- [ ] T038 Conferir `wrangler secret list` em `api`/`api-staging` antes de qualquer deploy — `RESEND_API_KEY` já deve existir (CONTEXT.md); não recriar
- [ ] T039 Aplicar `0008-signup-requests.sql` em staging (`wrangler d1 migrations apply <DB> --env staging --remote`) e só depois em produção, conforme Princípio III

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — mas T001→T002 são sequenciais (T002 usa o tipo que T001 exporta); T003, T004 paralelos entre si e com T001/T002 (arquivos diferentes)
- **Foundational (Phase 2)**: depende de Phase 1 completa — bloqueia as 3 user stories
- **User Stories (Phase 3-5)**: todas dependem de Foundational. **US1 e US2 são P1** — nenhuma é MVP sozinha por si só sem a outra fechar o ciclo (US1 cria a pendência, US2 decide), mas **US1 é entregável e testável isolada** (fica uma pendência no banco, visível só por SQL/logs até US2 ou US3 existirem — daí ser o MVP mínimo). US3 (P2) depende apenas de Foundational + do router criado em US2 (T026) — reaproveita o arquivo, não bloqueia logicamente.
- **Polish (Phase 6)**: depende de US1+US2+US3 completas

### Within Each User Story

- Tests antes da implementação correspondente (T012-T014 antes de T015+; T021-T023 antes de T024+; T030-T031 antes de T032+)
- `shared/` (Phase 1) → `api/` (Foundational + implementação de cada story) → `front/` (última tarefa de cada story)
- US3 reaproveita o arquivo de rotas criado em US2 (T026) — logo T033 depende de T026 existir, não apenas de Foundational

### Parallel Opportunities

- T003, T004 (schemas novos em `auth.schema.ts`) em paralelo com T001-T002 (arquivos diferentes dentro do mesmo pacote `shared`, mas cuidado: todos editam `shared/`, então rodar em paralelo só se forem arquivos diferentes — T001/T002 tocam `database.schema.ts`+`member.schema.ts`; T003/T004 tocam `auth.schema.ts`; sem conflito)
- T008, T009, T010, T011 (Foundational) — 4 arquivos diferentes, paralelos entre si
- T012, T013, T014 (testes de US1) — arquivos diferentes, paralelos
- T021, T022, T023 (testes de US2) — paralelos
- T030, T031 (testes de US3) — paralelos

---

## Parallel Example: Foundational

```bash
Task: "Adicionar SignupRequestNotFoundError, SignupRequestExpiredError, SignupRequestAlreadyDecidedError em api/src/core/errors/auth-errors.ts"
Task: "Criar api/src/repositories/signup-requests.repository.ts"
Task: "Adicionar createApprovedMemberAccount em api/src/repositories/auth.repository.ts"
Task: "Adicionar sendSignupApprovalRequest/sendSignupDecisionResult em api/src/lib/mailer.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Phase 1 (Setup) → Phase 2 (Foundational)
2. Phase 3 (US1): cadastro de `inactive`/`trainee` vira pendência real no banco
3. **PARE e valide**: cenários 1-2 do quickstart.md, testes de US1 passando
4. US1 sozinha não fecha o produto (ninguém decide a pendência ainda) — é MVP técnico, não funcional. Ver nota em Dependencies.

### Entrega incremental

1. Setup + Foundational → base pronta
2. US1 → pendência é gravada (cenários 1-2 do quickstart)
3. US2 → ciclo fecha: e-mail → login → decisão (cenários 3-5) — **aqui o produto vira utilizável**
4. US3 → conveniência: fila no painel, sem depender do e-mail (cenário 6 + regressão)
5. Polish → staging, depois produção

### Nota sobre paralelismo entre agentes/worktrees

Conforme `CONTEXT.md` ("Sessões em paralelo"): **`shared/` nunca é editado por dois agentes ao mesmo tempo** — Phase 1 é sequencial, um agente só, antes de qualquer bifurcação. **Migrations também não paralelizam** — T006 é único e todas as fases seguintes dependem dela já commitada. Depois de Foundational, US1/US2/US3 têm sobreposição de arquivo (todas tocam `signup-requests.service.ts`/`.routes.ts`) — **não são boas candidatas a worktrees paralelos** nesta feature, ao contrário do que a estrutura genérica de "Parallel Team Strategy" sugeriria. Rodar sequencialmente, um agente, é o caminho mais seguro aqui.
