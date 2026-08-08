import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    AuthErrorCode,
    AuthSessionResponseSchema,
    ErrorResponseSchema,
    ForgotPasswordResponseSchema,
    ForgotPasswordSchema,
    LoginSchema,
    MeResponseSchema,
    RefreshResponseSchema,
    RegisterMemberSchema,
    ResetPasswordSchema,
} from "shared";
import type { ZodError } from "zod";

import { httpError } from "../lib/http-error";
import { ResendMailer } from "../lib/mailer";
import { SupabaseMemberDirectory } from "../lib/member-directory";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { AuthRepository } from "../repositories/auth.repository";
import { AuthService, REFRESH_TOKEN_TTL_SECONDS } from "../services/auth.service";

export const authRouter = new OpenAPIHono<AuthEnv>();

// ============================================================
// Cookie do refresh token
// ============================================================

const REFRESH_COOKIE_NAME = "refresh_token";

/** `SameSite=None` + `Secure` porque front (Vercel) e API (Cloudflare) são sites diferentes. */
const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/auth",
} as const;

function setRefreshCookie(c: Context<AuthEnv>, token: string): void {
    setCookie(c, REFRESH_COOKIE_NAME, token, {
        ...REFRESH_COOKIE_OPTIONS,
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
    });
}

function clearRefreshCookie(c: Context<AuthEnv>): void {
    setCookie(c, REFRESH_COOKIE_NAME, "", { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
}

// ============================================================
// Composição e tradução de erros
// ============================================================

function buildService(c: Context<AuthEnv>): AuthService {
    return new AuthService({
        repository: new AuthRepository(c.env.DB),
        directory: new SupabaseMemberDirectory(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY),
        mailer: new ResendMailer(c.env.RESEND_API_KEY, c.env.RESEND_FROM_EMAIL),
        jwtSecret: c.env.JWT_SECRET,
        frontOrigin: c.env.FRONT_ORIGIN.split(",")[0].trim(),
        defer: (promise) => c.executionCtx.waitUntil(promise),
    });
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [AuthErrorCode.EMAIL_ALREADY_REGISTERED]: 409,
    [AuthErrorCode.NOT_A_MEMBER]: 403,
    [AuthErrorCode.MEMBER_NOT_ACTIVE]: 403,
    [AuthErrorCode.MEMBER_DIRECTORY_UNAVAILABLE]: 503,
    [AuthErrorCode.INVALID_CREDENTIALS]: 401,
    [AuthErrorCode.MISSING_REFRESH_TOKEN]: 401,
    [AuthErrorCode.INVALID_REFRESH_TOKEN]: 401,
    [AuthErrorCode.TOKEN_EXPIRED]: 401,
    [AuthErrorCode.INVALID_TOKEN]: 401,
    [AuthErrorCode.ACCOUNT_DEACTIVATED]: 401,
    [AuthErrorCode.INVALID_RESET_TOKEN]: 400,
    [AuthErrorCode.WEAK_PASSWORD]: 400,
};

interface DomainError {
    code: string;
    message: string;
    field?: string;
}

function throwDomainError(error: DomainError): never {
    throw httpError(
        STATUS_BY_ERROR_CODE[error.code] ?? 500,
        error.code,
        error.message,
        error.field,
    );
}

function mapValidationError(error: ZodError): DomainError {
    const issue = error.issues[0];
    const field = issue?.path[0];

    if (field === "password") {
        return {
            code: AuthErrorCode.WEAK_PASSWORD,
            message: issue.message,
            field: "password",
        };
    }

    return {
        code: "VALIDATION_ERROR",
        message: issue?.message ?? "Dados inválidos",
        field: typeof field === "string" ? field : undefined,
    };
}

function validationHook(result: { success: boolean; error?: ZodError }, c: Context<AuthEnv>) {
    if (!result.success && result.error) {
        return c.json({ error: mapValidationError(result.error) }, 400);
    }
}

function requestContext(c: Context<AuthEnv>) {
    return { userAgent: c.req.header("User-Agent") ?? null };
}

// ============================================================
// POST /auth/register
// ============================================================

const registerRoute = createRoute({
    method: "post",
    path: "/register",
    tags: ["Auth"],
    summary: "Cria a conta de um membro da CIMATEC jr",
    description:
        "Verifica se o email consta como membro ativo no banco da tec (Supabase) e só então cria usuário, perfil e sessão — os três no mesmo batch. O cadastro já autentica: responde com access token e cookie de refresh.",
    request: {
        body: {
            required: true,
            content: { "application/json": { schema: RegisterMemberSchema } },
        },
    },
    responses: {
        201: {
            description: "Conta criada e sessão iniciada",
            content: { "application/json": { schema: AuthSessionResponseSchema } },
        },
        400: {
            description: "Senha fora da política ou payload inválido (E4)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        403: {
            description: "Email não é de membro (E2) ou membro não elegível (E3)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Já existe conta com este email (E1/E6)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        503: {
            description: "Banco da tec indisponível (E5) — nada foi gravado",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

authRouter.openapi(
    registerRoute,
    async (c) => {
        const result = await buildService(c).register(c.req.valid("json"), requestContext(c));

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        const { refreshToken, ...session } = result.value;
        setRefreshCookie(c, refreshToken);

        return c.json({ data: session }, 201);
    },
    validationHook,
);

// ============================================================
// POST /auth/login
// ============================================================

const loginRoute = createRoute({
    method: "post",
    path: "/login",
    tags: ["Auth"],
    summary: "Autentica um membro que já tem conta",
    description:
        "Não consulta a Supabase: uma indisponibilidade dela impede cadastros novos, mas não derruba quem já tem conta. Email inexistente e senha errada produzem a mesma resposta.",
    request: {
        body: {
            required: true,
            content: { "application/json": { schema: LoginSchema } },
        },
    },
    responses: {
        200: {
            description: "Sessão iniciada",
            content: { "application/json": { schema: AuthSessionResponseSchema } },
        },
        400: {
            description: "Payload inválido",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        401: {
            description: "Credenciais inválidas (E7) ou conta desativada (E12)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

authRouter.openapi(
    loginRoute,
    async (c) => {
        const result = await buildService(c).login(c.req.valid("json"), requestContext(c));

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        const { refreshToken, ...session } = result.value;
        setRefreshCookie(c, refreshToken);

        return c.json({ data: session }, 200);
    },
    validationHook,
);

// ============================================================
// POST /auth/refresh
// ============================================================

const refreshRoute = createRoute({
    method: "post",
    path: "/refresh",
    tags: ["Auth"],
    summary: "Renova a sessão rotacionando o refresh token",
    description:
        "Sem corpo — a credencial é o cookie. Cada chamada revoga o token usado e emite outro na mesma família. Apresentar um token já revogado revoga a família inteira.",
    responses: {
        200: {
            description: "Sessão renovada",
            content: { "application/json": { schema: RefreshResponseSchema } },
        },
        401: {
            description: "Cookie ausente (E8), token inválido/expirado/reusado (E9/E10) ou conta desativada (E12)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

authRouter.openapi(refreshRoute, async (c) => {
    const result = await buildService(c).refresh(getRefreshToken(c), requestContext(c));

    if (result.isLeft()) {
        clearRefreshCookie(c);
        throwDomainError(result.value);
    }

    const { refreshToken, ...session } = result.value;
    setRefreshCookie(c, refreshToken);

    return c.json({ data: session }, 200);
});

// ============================================================
// POST /auth/logout
// ============================================================

const logoutRoute = createRoute({
    method: "post",
    path: "/logout",
    tags: ["Auth"],
    summary: "Encerra a sessão",
    description:
        "Idempotente: cookie ausente, inválido ou já revogado também respondem 204. Um erro aqui só atrapalharia o front a limpar o próprio estado.",
    responses: {
        204: { description: "Sessão encerrada (ou já estava)" },
    },
});

authRouter.openapi(logoutRoute, async (c) => {
    await buildService(c).logout(getRefreshToken(c));
    clearRefreshCookie(c);

    return c.body(null, 204);
});

// ============================================================
// GET /auth/me
// ============================================================

const meRoute = createRoute({
    method: "get",
    path: "/me",
    tags: ["Auth"],
    summary: "Dados do membro autenticado",
    description:
        "Lê o banco em vez de devolver o conteúdo do token: é a rota que o front usa para reidratar a sessão ao recarregar a página, e aí ele precisa do dado atual.",
    middleware: [requireAuth] as const,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Membro autenticado",
            content: { "application/json": { schema: MeResponseSchema } },
        },
        401: {
            description: "Token ausente, inválido ou expirado (E11); conta desativada (E12)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

authRouter.openapi(meRoute, async (c) => {
    const result = await buildService(c).me(c.get("auth").sub);

    if (result.isLeft()) {
        throwDomainError(result.value);
    }

    return c.json({ data: result.value }, 200);
});

// ============================================================
// POST /auth/forgot-password
// ============================================================

const forgotPasswordRoute = createRoute({
    method: "post",
    path: "/forgot-password",
    tags: ["Auth"],
    summary: "Pede um link de recuperação de senha",
    description:
        "Responde 202 com a mesma mensagem exista ou não o email — a rota não pode virar um verificador de contas. O envio sai do caminho crítico via waitUntil.",
    request: {
        body: {
            required: true,
            content: { "application/json": { schema: ForgotPasswordSchema } },
        },
    },
    responses: {
        202: {
            description: "Pedido aceito (resposta idêntica para email existente e inexistente)",
            content: { "application/json": { schema: ForgotPasswordResponseSchema } },
        },
        400: {
            description: "Email malformado",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

authRouter.openapi(
    forgotPasswordRoute,
    async (c) => {
        const result = await buildService(c).forgotPassword(c.req.valid("json"));

        return c.json({ data: result.value }, 202);
    },
    validationHook,
);

// ============================================================
// POST /auth/reset-password
// ============================================================

const resetPasswordRoute = createRoute({
    method: "post",
    path: "/reset-password",
    tags: ["Auth"],
    summary: "Redefine a senha usando o token do email",
    description:
        "Token de uso único, válido por 30 minutos. Ao trocar a senha, revoga todas as sessões do usuário — é o que faz a redefinição efetivamente expulsar quem estava dentro.",
    request: {
        body: {
            required: true,
            content: { "application/json": { schema: ResetPasswordSchema } },
        },
    },
    responses: {
        204: { description: "Senha redefinida; todas as sessões foram revogadas" },
        400: {
            description: "Token inválido/expirado/usado (E14) ou senha fora da política (E15)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

authRouter.openapi(
    resetPasswordRoute,
    async (c) => {
        const result = await buildService(c).resetPassword(c.req.valid("json"));

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        clearRefreshCookie(c);

        return c.body(null, 204);
    },
    validationHook,
);

/** Um cookie vazio (pós-logout) vale como ausente: E8, não E9. */
function getRefreshToken(c: Context<AuthEnv>): string | undefined {
    return getCookie(c, REFRESH_COOKIE_NAME) || undefined;
}
