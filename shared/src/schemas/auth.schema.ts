import { z } from "zod";

import { CourseSchema, EthnicitySchema, GenderSchema, SemesterSchema } from "./candidate.schema";
import type { SignupRequestStatus } from "./database.schema";
import { MemberStatusSchema, SelfDeclaredMemberStatusSchema } from "./member.schema";
import { PhoneSchema } from "./phone.schema";

// Cadastro, login e sessão de membro (FEAT-0003).
// Ver também `member.schema.ts` (elegibilidade) e `database.schema.ts`.

/** Normalizado (trim + lowercase): email é chave de correlação com a Supabase e chave `unique` em `users`. */
export const EmailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email("Informe um email válido");

/** Máximo de 128 pelo teto de CPU do PBKDF2 no plano Free do Worker (FEAT-0003, seção 8.2). */
export const PasswordSchema = z
    .string()
    .min(8, "A senha deve ter no mínimo 8 caracteres")
    .max(128, "A senha deve ter no máximo 128 caracteres");

// ------------------------------------------------------------
// Requests
// ------------------------------------------------------------

/**
 * `POST /auth/register` — trilha do membro Efetivo. Dados de perfil vêm da
 * Supabase, não deste payload. Desde a emenda de 2026-09-04 da FEAT-0008,
 * esta é a ÚNICA trilha que consulta a Supabase; ela exige `status ===
 * "active"` e recusa (403) qualquer outro valor — não bifurca mais para
 * pendência. Trainee/pós-júnior usam `SelfDeclaredSignupSchema` abaixo.
 */
export const RegisterMemberSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
});
export type RegisterMemberDTO = z.infer<typeof RegisterMemberSchema>;

/**
 * `POST /auth/signup-requests` — trilha auto-declarada de trainee/pós-júnior
 * (FEAT-0008, emenda 2026-09-04). NÃO consulta a Supabase: todo dado de
 * perfil vem deste payload, e a aprovação de um admin é o único portão
 * (FR-001-D). `memberStatus` usa `SelfDeclaredMemberStatusSchema`, não
 * `MemberStatusSchema` — "active" não é um valor aceitável aqui, de
 * propósito, para que o escalonamento de privilégio seja impossível por
 * construção (ver `research.md` R6). `birth_date` não é pedido (fica
 * `null` — a coluna já era nullable).
 */
export const SelfDeclaredSignupSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
    memberStatus: SelfDeclaredMemberStatusSchema,
    fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
    phone: PhoneSchema,
    course: CourseSchema,
    semester: SemesterSchema,
    gender: GenderSchema,
    ethnicity: EthnicitySchema,
});
export type SelfDeclaredSignupDTO = z.infer<typeof SelfDeclaredSignupSchema>;

/** `POST /auth/login`. Senha só valida não-vazia — fora da política é 401, não erro de formulário. */
export const LoginSchema = z.object({
    email: EmailSchema,
    password: z.string().min(1, "Informe sua senha"),
});
export type LoginDTO = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
    email: EmailSchema,
});
export type ForgotPasswordDTO = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
    token: z.string().min(1, "Link de recuperação inválido"),
    password: PasswordSchema,
});
export type ResetPasswordDTO = z.infer<typeof ResetPasswordSchema>;

/** `POST /auth/signup-requests/:id/decision` (FEAT-0008, US2/US3). */
export const SignupDecisionSchema = z.object({
    decision: z.enum(["approve", "reject"]),
});
export type SignupDecisionDTO = z.infer<typeof SignupDecisionSchema>;

// ------------------------------------------------------------
// Responses
// ------------------------------------------------------------

export const AuthUserSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    role: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/** O refresh token não aparece aqui — viaja só no cookie `HttpOnly`. */
export const AuthSessionResponseSchema = z.object({
    data: z.object({
        accessToken: z.string(),
        expiresIn: z.number().int().positive(),
        user: AuthUserSchema,
    }),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const RefreshResponseSchema = z.object({
    data: z.object({
        accessToken: z.string(),
        expiresIn: z.number().int().positive(),
    }),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

/** Snapshot da tec, exposto em `GET /auth/me`. `syncedAt` marca o quão velho é. */
export const MemberProfileSummarySchema = z.object({
    /** uuid na tec — string, não number. */
    memberId: z.string(),
    fullName: z.string(),
    phone: z.string(),
    course: z.string(),
    semester: z.number().int(),
    manager: z.boolean(),
    syncedAt: z.string(),
});
export type MemberProfileSummary = z.infer<typeof MemberProfileSummarySchema>;

export const MeResponseSchema = z.object({
    data: AuthUserSchema.extend({
        profile: MemberProfileSummarySchema,
    }),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Mensagem condicional e idêntica para email existente/inexistente (FEAT-0003, seção 4.6). */
export const ForgotPasswordResponseSchema = z.object({
    data: z.object({
        message: z.string(),
    }),
});
export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;

/**
 * `POST /auth/register` quando o membro precisa de aprovação (202, FEAT-0008
 * FR-004). Distinta de `AuthSessionResponseSchema` — sem sessão, porque
 * nenhuma conta foi criada ainda (ver `research.md` da 008, R1).
 */
export const RegisterPendingResponseSchema = z.object({
    data: z.object({
        status: z.literal("pending_approval"),
        message: z.string(),
    }),
});
export type RegisterPendingResponse = z.infer<typeof RegisterPendingResponseSchema>;

// ------------------------------------------------------------
// Solicitações de cadastro (FEAT-0008)
// ------------------------------------------------------------

export const SignupRequestStatusSchema = z.enum([
    "pending",
    "approved",
    "rejected",
]) satisfies z.ZodType<SignupRequestStatus>;

/** Item de listagem (US3) — sem `password_hash`, sem `member_id` cru da tec. */
export const SignupRequestSummarySchema = z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    memberStatus: MemberStatusSchema,
    createdAt: z.string(),
    /** FR-019 — quantas vezes essa pessoa já foi recusada antes. */
    priorRejectionCount: z.number().int().min(0),
    /**
     * FR-022 (emenda 2026-09-04) — `true` quando os dados vieram do
     * formulário de auto-declaração, sem nenhuma conferência externa. O
     * admin é o único portão nesse caso; a fila sinaliza isso.
     */
    selfDeclared: z.boolean(),
});
export type SignupRequestSummary = z.infer<typeof SignupRequestSummarySchema>;

export const SignupRequestListResponseSchema = z.object({
    data: z.array(SignupRequestSummarySchema),
});
export type SignupRequestListResponse = z.infer<typeof SignupRequestListResponseSchema>;

/** Detalhe (US2) — o que `GET /auth/signup-requests/by-token/:token` devolve. */
export const SignupRequestDetailSchema = SignupRequestSummarySchema.extend({
    status: SignupRequestStatusSchema,
    decidedAt: z.string().nullable(),
});
export type SignupRequestDetail = z.infer<typeof SignupRequestDetailSchema>;

export const SignupRequestDetailResponseSchema = z.object({
    data: SignupRequestDetailSchema,
});
export type SignupRequestDetailResponse = z.infer<typeof SignupRequestDetailResponseSchema>;

// Códigos de erro — cenários E1-E15 de FEAT-0003 (seção 5).

export const AuthErrorCode = {
    EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED", // E1, E6
    NOT_A_MEMBER: "NOT_A_MEMBER", // E2
    MEMBER_NOT_ACTIVE: "MEMBER_NOT_ACTIVE", // E3
    MEMBER_DIRECTORY_UNAVAILABLE: "MEMBER_DIRECTORY_UNAVAILABLE", // E5, transitório
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS", // E7
    MISSING_REFRESH_TOKEN: "MISSING_REFRESH_TOKEN", // E8
    INVALID_REFRESH_TOKEN: "INVALID_REFRESH_TOKEN", // E9, E10
    TOKEN_EXPIRED: "TOKEN_EXPIRED", // E11 — front deve renovar, não deslogar
    INVALID_TOKEN: "INVALID_TOKEN", // E11
    ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED", // E12
    INVALID_RESET_TOKEN: "INVALID_RESET_TOKEN", // E14
    WEAK_PASSWORD: "WEAK_PASSWORD", // E4, E15
    /** Primeiro código de autorização por papel do projeto — nasce em FEAT-0005 (E9), `requireRole`. */
    INSUFFICIENT_ROLE: "INSUFFICIENT_ROLE",

    // FEAT-0008 — solicitações de cadastro pendentes de aprovação.
    /** Token do link de decisão não existe. Mesma superfície de erro que expirado — não revela diferença. */
    SIGNUP_REQUEST_NOT_FOUND: "SIGNUP_REQUEST_NOT_FOUND",
    /** Token do link de decisão passou dos 7 dias de validade (FR-009). */
    SIGNUP_REQUEST_EXPIRED: "SIGNUP_REQUEST_EXPIRED",
    /** Alguém já decidiu esta solicitação — transição atômica, FR-010. */
    SIGNUP_REQUEST_ALREADY_DECIDED: "SIGNUP_REQUEST_ALREADY_DECIDED",
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/** Cargo na empresa (`manager`) ≠ papel na aplicação — não concede `admin`. */
export const ROLES = {
    ADMIN: "admin",
    AVALIADOR: "avaliador",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
