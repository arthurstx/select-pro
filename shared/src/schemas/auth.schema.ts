import { z } from "zod";

// ============================================================
// Cadastro, login e sessão de membro (FEAT-0003).
//
// Fonte única das regras de credencial — front e api consomem daqui.
// Ver também `member.schema.ts` (elegibilidade) e `database.schema.ts`
// (linhas de `users`, `member_profiles`, `sessions`).
// ============================================================

/**
 * Normaliza no próprio schema: trim + lowercase. Email é chave de correlação
 * com a Supabase, chave `unique` em `users` e identificador de login — as três
 * coisas quebram se `Fulano@…` e `fulano@…` forem tratados como distintos.
 * Normalizar aqui garante que front e api cheguem no mesmo valor sem depender
 * de ninguém lembrar de fazer isso.
 */
export const EmailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email("Informe um email válido");

/**
 * Mínimo de 8 (mesmo do `UserSchema`, anterior a esta spec), máximo de 128.
 *
 * O máximo não é estético: a derivação PBKDF2 roda dentro do teto de 10 ms de
 * CPU do plano Free do Worker, e uma senha de 1 MB vira vetor de consumo de
 * CPU (FEAT-0003, seção 8.2).
 *
 * Não há regra de composição (maiúscula, símbolo, dígito): elas empurram o
 * usuário para senhas previsíveis do tipo `Senha@123` sem mover a entropia.
 */
export const PasswordSchema = z
    .string()
    .min(8, "A senha deve ter no mínimo 8 caracteres")
    .max(128, "A senha deve ter no máximo 128 caracteres");

// ------------------------------------------------------------
// Requests
// ------------------------------------------------------------

/**
 * `POST /auth/register`.
 *
 * Só email e senha. Nome, telefone, curso, semestre, gênero e etnia **não**
 * entram aqui: vêm da Supabase, que é a fonte da verdade sobre o membro.
 * Aceitá-los permitiria a alguém se cadastrar com dados diferentes dos que a
 * empresa tem (FEAT-0003, seção 8.2).
 *
 * `confirmPassword` também não existe neste schema — é campo só de cliente,
 * validado na tela com `.refine()` e nunca enviado (FEAT-0003-UI, seção 6).
 */
export const RegisterMemberSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
});
export type RegisterMemberDTO = z.infer<typeof RegisterMemberSchema>;

/**
 * `POST /auth/login`.
 *
 * A senha é validada apenas como não vazia, e não com `PasswordSchema`: no
 * login, senha fora da política é `INVALID_CREDENTIALS` (401) vindo do
 * backend, não erro de formulário. Aplicar `min(8)` aqui barraria no cliente
 * quem tem senha legítima mais curta caso a política mude no futuro.
 */
export const LoginSchema = z.object({
    email: EmailSchema,
    password: z.string().min(1, "Informe sua senha"),
});
export type LoginDTO = z.infer<typeof LoginSchema>;

/** `POST /auth/forgot-password`. */
export const ForgotPasswordSchema = z.object({
    email: EmailSchema,
});
export type ForgotPasswordDTO = z.infer<typeof ForgotPasswordSchema>;

/** `POST /auth/reset-password`. O token vem do link enviado por email. */
export const ResetPasswordSchema = z.object({
    token: z.string().min(1, "Link de recuperação inválido"),
    password: PasswordSchema,
});
export type ResetPasswordDTO = z.infer<typeof ResetPasswordSchema>;

// ------------------------------------------------------------
// Responses
// ------------------------------------------------------------

/** Identidade mínima que acompanha toda sessão emitida. */
export const AuthUserSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    /** `roles.value` — `"avaliador"` em todo cadastro; `"admin"` só por promoção manual. */
    role: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/**
 * Resposta de `POST /auth/register` (201) e `POST /auth/login` (200).
 *
 * ⚠️ O refresh token **não aparece aqui** e não pode aparecer: ele viaja
 * exclusivamente no cookie `HttpOnly`. Colocá-lo no corpo o entrega a
 * qualquer script na página e anula a razão de o cookie ser `HttpOnly`.
 */
export const AuthSessionResponseSchema = z.object({
    data: z.object({
        accessToken: z.string(),
        /** Segundos até o access token expirar (900 = 15 min). */
        expiresIn: z.number().int().positive(),
        user: AuthUserSchema,
    }),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

/** Resposta de `POST /auth/refresh` (200) — sessão renovada, sem dados do usuário. */
export const RefreshResponseSchema = z.object({
    data: z.object({
        accessToken: z.string(),
        expiresIn: z.number().int().positive(),
    }),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

/**
 * Snapshot dos dados que vieram da tec, exposto em `GET /auth/me`.
 *
 * `syncedAt` está aqui de propósito: deixa explícito que estes dados são de
 * quando a conta foi criada e podem estar desatualizados (FEAT-0003, seção 9).
 */
export const MemberProfileSummarySchema = z.object({
    memberId: z.number().int(),
    fullName: z.string(),
    phone: z.string(),
    course: z.string(),
    semester: z.number().int(),
    manager: z.boolean(),
    syncedAt: z.string(),
});
export type MemberProfileSummary = z.infer<typeof MemberProfileSummarySchema>;

/** Resposta de `GET /auth/me` (200). */
export const MeResponseSchema = z.object({
    data: AuthUserSchema.extend({
        profile: MemberProfileSummarySchema,
    }),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * Resposta de `POST /auth/forgot-password` (202).
 *
 * A mensagem é **condicional** de propósito ("se o email estiver cadastrado")
 * e idêntica para email existente e inexistente. Uma confirmação afirmativa
 * seria mentira num dos dois casos e transformaria a rota num verificador de
 * contas (FEAT-0003, seção 4.6).
 */
export const ForgotPasswordResponseSchema = z.object({
    data: z.object({
        message: z.string(),
    }),
});
export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;

// ============================================================
// Códigos de erro — cenários E1–E15 de FEAT-0003 (seção 5).
// ============================================================

export const AuthErrorCode = {
    /** E1 (checagem prévia) e E6 (constraint `unique` do insert) — mesmo conflito. */
    EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED",
    /** E2 — email não consta em `members` na Supabase. Definitivo. */
    NOT_A_MEMBER: "NOT_A_MEMBER",
    /** E3 — membro existe, mas o status não é elegível. Definitivo. */
    MEMBER_NOT_ACTIVE: "MEMBER_NOT_ACTIVE",
    /** E5 — Supabase fora do ar/timeout. **Transitório**: a UI deve sugerir tentar de novo. */
    MEMBER_DIRECTORY_UNAVAILABLE: "MEMBER_DIRECTORY_UNAVAILABLE",
    /** E7 — idêntico para email inexistente e senha errada. Nunca revelar qual. */
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    /** E8 — `/auth/refresh` sem o cookie. */
    MISSING_REFRESH_TOKEN: "MISSING_REFRESH_TOKEN",
    /** E9 e E10 — inválido, expirado ou reuso detectado. O cliente não distingue. */
    INVALID_REFRESH_TOKEN: "INVALID_REFRESH_TOKEN",
    /** E11 — access token expirado. O front deve renovar e repetir, **não** deslogar. */
    TOKEN_EXPIRED: "TOKEN_EXPIRED",
    /** E11 — assinatura inválida ou token malformado. Aqui sim, fim de sessão. */
    INVALID_TOKEN: "INVALID_TOKEN",
    /** E12 — `users.deactivated_at` preenchido. */
    ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
    /** E14 — token de recuperação inválido, expirado ou já usado. */
    INVALID_RESET_TOKEN: "INVALID_RESET_TOKEN",
    /** E4 e E15 — senha fora da política. */
    WEAK_PASSWORD: "WEAK_PASSWORD",
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/**
 * Papéis da aplicação. Correspondem às linhas semeadas em `roles` pela
 * migration 0005 — `roles.id` usa o próprio slug como chave.
 *
 * Papel na aplicação ≠ cargo na empresa: o `manager` da tec é gravado no
 * snapshot mas **não** concede `admin` (FEAT-0003, seção 9).
 */
export const ROLES = {
    ADMIN: "admin",
    AVALIADOR: "avaliador",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
