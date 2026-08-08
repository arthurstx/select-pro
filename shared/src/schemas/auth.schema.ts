import { z } from "zod";

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

/** `POST /auth/register`. Dados de perfil vêm da Supabase, não deste payload. */
export const RegisterMemberSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
});
export type RegisterMemberDTO = z.infer<typeof RegisterMemberSchema>;

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
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/** Cargo na empresa (`manager`) ≠ papel na aplicação — não concede `admin`. */
export const ROLES = {
    ADMIN: "admin",
    AVALIADOR: "avaliador",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
