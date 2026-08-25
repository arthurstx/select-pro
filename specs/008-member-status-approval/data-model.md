# Data Model: Status de membro e aprovação de cadastro

## Mudança de domínio (sem migration)

### `MemberStatus` (`shared/src/schemas/database.schema.ts`)

```ts
export type MemberStatus = "active" | "inactive" | "trainee";
```

Remove `"alumni"` e `"on_leave"` do tipo (D3). `member_profiles.status` e
`TecMemberSchema.status` continuam `TEXT`/`string` livres na origem — nenhuma
migration de schema aqui, só o domínio TypeScript/Zod que interpreta esse
texto muda.

### `shared/src/schemas/member.schema.ts`

Substituições:

| Antes | Depois | Papel |
|---|---|---|
| `MemberStatusSchema` (4 valores) | `MemberStatusSchema` (3 valores) | mesmo nome, novo enum |
| `ELIGIBLE_MEMBER_STATUSES = ["active"]` | `RECOGNIZED_MEMBER_STATUSES = ["active","inactive","trainee"]` | renomeado: "elegível" não descrevia mais o conceito — agora todo status reconhecido pode se cadastrar, só muda se precisa de aprovação |
| `isEligibleMemberStatus(status)` | `isRecognizedMemberStatus(status): status is MemberStatus` | mesmo type predicate, nome alinhado ao novo conceito |
| — | `requiresApproval(status: MemberStatus): boolean` | `status !== "active"` — decide o branch em `register()` |
| — | `isEligibleToAnchorTrainee(status: MemberStatus): boolean` | `status !== "trainee"` — consumido pela feature 012 (FR-017) |

`isRecognizedMemberStatus(status) === false` continua caindo em
`MemberNotActiveError` (403) — mesmo comportamento de hoje para um status
fora do domínio, só que agora o domínio tem 3 valores em vez de 1.

## Migration 0008 — `signup-requests.sql` (aditiva, sem `MAINTENANCE_MODE`)

Segue o padrão de `0005-member-auth.sql`: aditiva, sem reconstrução de
tabela, sem risco de perda de dado (Princípio III da constitution — a janela
de manutenção só é exigida para migration destrutiva).

### `signup_requests`

Uma linha por tentativa de cadastro de membro `inactive`/`trainee`. Guarda o
que `register()` precisa para criar a conta **depois**, na aprovação — não
antes (ver `research.md`, R1).

```sql
CREATE TABLE signup_requests (
  id TEXT PRIMARY KEY,

  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,

  -- Snapshot do membro na Supabase no momento do pedido — mesmos campos que
  -- member_profiles guarda para quem já tem conta. Sem CHECK, mesmo motivo
  -- de member_profiles: valores de um sistema que não controlamos.
  member_id      TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  phone          TEXT NOT NULL,
  birth_date     TEXT,
  course         TEXT NOT NULL,
  semester       INTEGER NOT NULL,
  gender         TEXT NOT NULL,
  ethnicity      TEXT NOT NULL,
  member_status  TEXT NOT NULL, -- "inactive" | "trainee" na prática (FR-004)
  manager        INTEGER NOT NULL DEFAULT 0,

  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- FR-016: no máximo uma pendente por email. Índice parcial, não UNIQUE
-- simples — precisa permitir várias linhas históricas (recusada → nova
-- solicitação, FR-018) para o mesmo email, só nunca duas pendentes.
CREATE UNIQUE INDEX idx_signup_requests_pending_email
  ON signup_requests(email) WHERE status = 'pending';

CREATE INDEX idx_signup_requests_status ON signup_requests(status);
CREATE INDEX idx_signup_requests_email  ON signup_requests(email);
```

`decided_by` é `NULL` só enquanto `status = 'pending'` — a decisão de R2 exige
sessão de admin, então toda linha decidida tem autor (SC-005).

### `signup_approval_tokens`

Mesmo papel que `password_reset_tokens` tem para reset de senha: credencial
de leitura opaca, hash-only no banco. Não autoriza a decisão (R2) — só a
visualização antes do login.

```sql
CREATE TABLE signup_approval_tokens (
  id                 TEXT PRIMARY KEY,
  signup_request_id TEXT NOT NULL REFERENCES signup_requests(id) ON DELETE CASCADE,

  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, -- 7 dias (Assumptions da spec)

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_signup_approval_tokens_request ON signup_approval_tokens(signup_request_id);
```

Sem `used_at`: ao contrário do token de reset de senha, este não é
consumido por uso (R2) — só expira.

## Entidades no `shared` (contratos de request/response)

```ts
// shared/src/schemas/auth.schema.ts (extensão)

export const SignupRequestStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type SignupRequestStatus = z.infer<typeof SignupRequestStatusSchema>;

/** Item de listagem (US3) — sem password_hash, sem member_id cru. */
export const SignupRequestSummarySchema = z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    memberStatus: MemberStatusSchema,
    createdAt: z.string(),
    /** FR-019: quantas vezes essa pessoa já foi recusada antes. */
    priorRejectionCount: z.number().int().min(0),
});
export type SignupRequestSummary = z.infer<typeof SignupRequestSummarySchema>;

export const SignupRequestListResponseSchema = z.object({
    data: z.array(SignupRequestSummarySchema),
});

/** Detalhe (US2) — o que a tela de decisão mostra, vindo de GET .../by-token/:token. */
export const SignupRequestDetailSchema = SignupRequestSummarySchema.extend({
    status: SignupRequestStatusSchema,
    decidedAt: z.string().nullable(),
});
export const SignupRequestDetailResponseSchema = z.object({
    data: SignupRequestDetailSchema,
});

export const SignupDecisionSchema = z.object({
    decision: z.enum(["approve", "reject"]),
});
export type SignupDecisionDTO = z.infer<typeof SignupDecisionSchema>;

/** POST /auth/register quando o membro precisa de aprovação (202). */
export const RegisterPendingResponseSchema = z.object({
    data: z.object({
        status: z.literal("pending_approval"),
        message: z.string(),
    }),
});
```

Novos códigos em `AuthErrorCode`:

```ts
SIGNUP_REQUEST_NOT_FOUND: "SIGNUP_REQUEST_NOT_FOUND",       // token/id não existe (404)
SIGNUP_REQUEST_EXPIRED: "SIGNUP_REQUEST_EXPIRED",           // link > 7 dias (404 — mesma superfície que not_found, sem revelar diferença)
SIGNUP_REQUEST_ALREADY_DECIDED: "SIGNUP_REQUEST_ALREADY_DECIDED", // 409 — FR-010
```

## Estados de `signup_requests.status`

```
pending ──approve──▶ approved   (conta criada, decided_by + decided_at gravados)
pending ──reject───▶ rejected   (decided_by + decided_at gravados)

rejected ──(novo cadastro, mesmo email)──▶ nova linha `pending`  [FR-018]
```

Não existe transição de volta a partir de `approved` ou `rejected` — a
transição é de mão única, reforçada pelo `WHERE status = 'pending'` do
`UPDATE` (R4).
