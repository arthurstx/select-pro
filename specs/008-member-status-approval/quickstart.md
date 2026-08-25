# Quickstart: validação ponta a ponta da 008

Pré-requisitos: `npm install` na raiz, `api/.dev.vars` com
`MEMBER_DIRECTORY_BYPASS=true` (usa `LocalMemberDirectory` — sem depender da
Supabase real), migration `0008-signup-requests.sql` aplicada localmente.

```bash
npm run dev --workspace=api
```

## Cenário 1 — cadastro `active` continua direto (regressão)

```bash
curl -X POST http://localhost:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"ativo@cimatecjr.com.br","password":"senha1234"}'
```

Esperado: `201`, `AuthSessionResponseSchema`, sem linha nova em
`signup_requests`.

## Cenário 2 — cadastro `inactive`/`trainee` vira pendência (US1)

```bash
curl -X POST http://localhost:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"posjunior@cimatecjr.com.br","password":"senha1234"}'
```

Esperado: `202`, `RegisterPendingResponseSchema`. Confirmar:
- linha em `signup_requests` com `status = 'pending'`
- **nenhuma** linha em `users` para esse email
- log `mailer` disparado (ou e-mail chegando em staging, com `RESEND_API_KEY` real)

Repetir a mesma chamada: esperado `202` idêntico, **sem** segunda linha em
`signup_requests` (FR-016 / R3).

## Cenário 3 — decisão sem login não decide nada (FR-007)

```bash
curl http://localhost:8787/auth/signup-requests/by-token/<token-do-email>
```

Esperado: `200` com os dados da solicitação. Repetir a chamada: mesmo
resultado, `signup_requests.status` continua `pending` — abrir/reabrir o link
nunca muda estado.

## Cenário 4 — decisão exige sessão de admin (R2)

```bash
curl -X POST http://localhost:8787/auth/signup-requests/<id>/decision \
  -d '{"decision":"approve"}'
# sem Authorization: Bearer → 401
```

Depois, com token de admin:

```bash
curl -X POST http://localhost:8787/auth/signup-requests/<id>/decision \
  -H "Authorization: Bearer <token-admin>" \
  -H "Content-Type: application/json" \
  -d '{"decision":"approve"}'
```

Esperado: `204`. Confirmar: linha nova em `users`+`member_profiles`, sem
sessão emitida para esse usuário; `signup_requests.decided_by` = id do admin.

## Cenário 5 — decisão em duplicidade (FR-010)

Repetir a chamada do Cenário 4 (mesmo `id`, já aprovado): esperado `409`
`SIGNUP_REQUEST_ALREADY_DECIDED`.

## Cenário 6 — recusa não é definitiva (FR-018)

Recusar uma solicitação, depois repetir o `POST /auth/register` do Cenário 2
com o mesmo email: esperado `202` novo, com uma segunda linha em
`signup_requests` (a recusada anterior permanece, para alimentar
`priorRejectionCount` na próxima decisão — FR-019).

## Testes automatizados

```bash
npm run test --workspace=api
```

Cobre: `signup-requests.service.test.ts`, `signup-requests.routes.test.ts`
(novos, Princípio V), mais `auth.service.test.ts`/`auth.routes.test.ts`
atualizados para a bifurcação de `register()`.
