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

## Cenário 2 — cadastro `inactive`/`trainee` na Supabase (comportamento pré-emenda, hoje obsoleto)

> [!NOTE]
> **Emenda de 2026-09-04**: a Supabase não devolve mais `inactive`/`trainee`.
> Este cenário descreve o comportamento antigo só para registro histórico —
> o cenário atual equivalente é o **Cenário 2-B** abaixo.

```bash
curl -X POST http://localhost:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"posjunior@cimatecjr.com.br","password":"senha1234"}'
```

Esperado (pré-emenda): `202`, `RegisterPendingResponseSchema`. Confirmar:
- linha em `signup_requests` com `status = 'pending'`
- **nenhuma** linha em `users` para esse email
- log `mailer` disparado (ou e-mail chegando em staging, com `RESEND_API_KEY` real)

Repetir a mesma chamada: esperado `202` idêntico, **sem** segunda linha em
`signup_requests` (FR-016 / R3).

## Cenário 2-B — status não-`active` na Supabase agora é 403 (emenda 2026-09-04)

```bash
curl -X POST http://localhost:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"posjunior@cimatecjr.com.br","password":"senha1234"}'
```

Esperado: `403` `MEMBER_NOT_ACTIVE`, mensagem orientando Trainee/Pós-júnior.
Confirmar: **nenhuma** linha nova em `signup_requests` nem em `users`.

## Cenário 2-C — cadastro auto-declarado de trainee/pós-júnior (emenda 2026-09-04)

```bash
curl -X POST http://localhost:8787/auth/signup-requests \
  -H "Content-Type: application/json" \
  -d '{
    "email":"trainee@example.com","password":"senha1234",
    "memberStatus":"trainee","fullName":"Fulano de Tal",
    "phone":"(71) 98888-7777","course":"eng-computacao",
    "semester":3,"gender":"masculino","ethnicity":"parda"
  }'
```

Esperado: `202`, `RegisterPendingResponseSchema`, **sem** nenhuma chamada ao
`fetch` da Supabase (confirmar nos logs — `MEMBER_DIRECTORY_BYPASS` nem
precisa estar setado, essa rota não usa `MemberDirectory`). Confirmar no D1:
- `signup_requests.member_id` casa `^self:[0-9a-f-]{36}$`
- `signup_requests.manager = 0`, `birth_date IS NULL`
- `signup_requests.phone` em E.164 (`+5571988887777`)

Repetir com `"memberStatus":"active"`: esperado `400` `VALIDATION_ERROR`,
nenhuma linha gravada (FR-001-C / SC-008).

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

## Cenário 7 — migration 0016, verificação manual em staging (emenda 2026-09-04)

Não coberto por teste automatizado (as migrations aplicam num D1 vazio, sem
linha `inactive` para converter). Rodar em staging, antes e depois de aplicar
`0016-post-junior-status-rename.sql`:

```sql
SELECT status, COUNT(*) FROM member_profiles GROUP BY status;
SELECT member_status, COUNT(*) FROM signup_requests GROUP BY member_status;
```

Esperado depois: nenhuma linha com `status`/`member_status = 'inactive'`; a
contagem que antes era `inactive` agora aparece em `post_junior`; total de
linhas inalterado.

## Testes automatizados

```bash
npm run test --workspace=api
```

Cobre: `signup-requests.service.test.ts`, `signup-requests.routes.test.ts`
(novos, Princípio V), mais `auth.service.test.ts`/`auth.routes.test.ts`
atualizados para a bifurcação de `register()`. *(Emenda 2026-09-04: os
mesmos arquivos passam a cobrir `createSelfDeclared` e `POST
/auth/signup-requests`, e os casos `it.each(["inactive","trainee"])` passam
a esperar 403 em vez de 202 — ver plan.md.)*
