# Contrato: Solicitações de Cadastro

Todos os schemas referenciados vivem em `shared/src/schemas/auth.schema.ts`
(ver `data-model.md`). Endpoints novos montados em `/auth/signup-requests`,
mesmo router pattern de `auth.routes.ts` (arquivo próprio,
`signup-requests.routes.ts`, por coesão — ver Constitution Check no `plan.md`).

## `POST /auth/register` (comportamento estendido)

Sem mudança de shape de request (`RegisterMemberSchema` inalterado). A
resposta agora bifurca pelo `MemberStatus` do membro encontrado na Supabase:

| Status do membro | Resposta | Efeito |
|---|---|---|
| `active` | `201` `AuthSessionResponseSchema` | inalterado — cria conta e sessão |
| `inactive` \| `trainee` | `202` `RegisterPendingResponseSchema` | cria `signup_requests` (se não houver uma `pending` para o email — R3), despacha e-mail para o admin via `defer()` |
| não reconhecido / não é membro | `403` (inalterado) | `NotAMemberError` / `MemberNotActiveError`, como hoje |

## `GET /auth/signup-requests`

Middleware: `[requireAuth, requireRole(ROLES.ADMIN)]`.

Query: `status` (`pending` | `approved` | `rejected`, default `pending`).

Resposta `200`: `SignupRequestListResponseSchema`.

## `GET /auth/signup-requests/by-token/:token`

**Sem middleware de auth** — token-gated (R2). Resolve o token opaco contra
`signup_approval_tokens`, carrega o `signup_requests` associado.

Respostas:
- `200` `SignupRequestDetailResponseSchema`
- `404` `SIGNUP_REQUEST_EXPIRED` ou `SIGNUP_REQUEST_NOT_FOUND` — mesma
  superfície de erro para token inexistente e token expirado, mesmo
  princípio de "não revelar diferença" já usado em `forgot-password`.

## `POST /auth/signup-requests/:id/decision`

Middleware: `[requireAuth, requireRole(ROLES.ADMIN)]` (R2 — decisão sempre
autenticada, venha do painel ou do link de e-mail após login).

Body: `SignupDecisionSchema` (`{ decision: "approve" | "reject" }`).

Transição atômica `WHERE id = ? AND status = 'pending'` (R4):

| Resultado | Resposta |
|---|---|
| aprovado | `204` — cria `users` + `member_profiles` (sem sessão — o membro loga depois), grava `decided_by`/`decided_at`, e-mail de resultado ao membro via `defer()` |
| recusado | `204` — grava `decided_by`/`decided_at`, e-mail de resultado ao membro via `defer()` |
| já decidida (`changes === 0`) | `409` `SIGNUP_REQUEST_ALREADY_DECIDED` |
| id inexistente | `404` `SIGNUP_REQUEST_NOT_FOUND` |

## Fluxo ponta a ponta (US2)

```
E-mail (gentegestao@cimatecjr.com.br)
  └─ link → GET /auth/signup-requests/by-token/:token   [sem login]
              └─ front mostra os dados
              └─ admin clica Aprovar/Recusar
                   └─ sem sessão? → /login?returnTo=<esta-tela>
                   └─ com sessão? → POST /auth/signup-requests/:id/decision
```
