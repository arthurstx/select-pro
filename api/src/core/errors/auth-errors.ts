import { AuthErrorCode } from "shared";

// Erros de domínio do cadastro e da autenticação de membro (FEAT-0003, seção 5).
// O status HTTP fica na rota, não aqui.

export class EmailAlreadyRegisteredError extends Error {
    readonly code = AuthErrorCode.EMAIL_ALREADY_REGISTERED;
    readonly field = "email";

    constructor(message = "Já existe uma conta com este email") {
        super(message);
        this.name = "EmailAlreadyRegisteredError";
    }
}

/** E2 — o email não consta em `members` na Supabase. Definitivo. */
export class NotAMemberError extends Error {
    readonly code = AuthErrorCode.NOT_A_MEMBER;
    readonly field = "email";

    constructor(
        message = "Este email não consta como membro da CIMATEC jr. Use o email cadastrado na empresa.",
    ) {
        super(message);
        this.name = "NotAMemberError";
    }
}

/** E5 — Supabase não respondeu. Transitório: nenhuma linha é gravada no D1 quando ocorre. */
export class MemberDirectoryUnavailableError extends Error {
    readonly code = AuthErrorCode.MEMBER_DIRECTORY_UNAVAILABLE;

    constructor(
        message = "Não foi possível verificar seu cadastro de membro agora. Tente novamente em alguns instantes.",
    ) {
        super(message);
        this.name = "MemberDirectoryUnavailableError";
    }
}

/** E7 — email inexistente e senha errada compartilham a mesma classe/mensagem de propósito. */
export class InvalidCredentialsError extends Error {
    readonly code = AuthErrorCode.INVALID_CREDENTIALS;

    constructor(message = "Email ou senha incorretos") {
        super(message);
        this.name = "InvalidCredentialsError";
    }
}

/** E12 — `users.deactivated_at` preenchido. Todas as sessões do usuário são revogadas junto. */
export class AccountDeactivatedError extends Error {
    readonly code = AuthErrorCode.ACCOUNT_DEACTIVATED;

    constructor(message = "Esta conta foi desativada. Procure a diretoria.") {
        super(message);
        this.name = "AccountDeactivatedError";
    }
}

/** E8 — `/auth/refresh` sem o cookie. */
export class MissingRefreshTokenError extends Error {
    readonly code = AuthErrorCode.MISSING_REFRESH_TOKEN;

    constructor(message = "Sessão não encontrada. Faça login novamente.") {
        super(message);
        this.name = "MissingRefreshTokenError";
    }
}

/** E9/E10 — token não encontrado, expirado ou reuso detectado. O cliente não distingue. */
export class InvalidRefreshTokenError extends Error {
    readonly code = AuthErrorCode.INVALID_REFRESH_TOKEN;

    constructor(message = "Sessão expirada. Faça login novamente.") {
        super(message);
        this.name = "InvalidRefreshTokenError";
    }
}

/** E11 — token malformado/assinatura inválida/usuário inexistente. Distinto de "expirado". */
export class InvalidAccessTokenError extends Error {
    readonly code = AuthErrorCode.INVALID_TOKEN;

    constructor(message = "Sessão inválida. Faça login novamente.") {
        super(message);
        this.name = "InvalidAccessTokenError";
    }
}

/** E11 — access token expirado. O front deve chamar `/auth/refresh`, não deslogar. */
export class AccessTokenExpiredError extends Error {
    readonly code = AuthErrorCode.TOKEN_EXPIRED;

    constructor(message = "Sessão expirada. Renove e tente novamente.") {
        super(message);
        this.name = "AccessTokenExpiredError";
    }
}

/**
 * E9 da FEAT-0005 — papel do token fora do conjunto permitido pela rota.
 * Nasce com `requireRole` (FEAT-0005), mas o código mora aqui: é o primeiro
 * código de autorização do projeto e não pertence a uma feature de negócio.
 */
export class InsufficientRoleError extends Error {
    readonly code = AuthErrorCode.INSUFFICIENT_ROLE;

    constructor(message = "Você não tem permissão para executar esta ação") {
        super(message);
        this.name = "InsufficientRoleError";
    }
}

/** E14 — token de recuperação não encontrado, expirado ou já usado. Sem dizer qual. */
export class InvalidResetTokenError extends Error {
    readonly code = AuthErrorCode.INVALID_RESET_TOKEN;

    constructor(
        message = "Este link de recuperação é inválido ou expirou. Peça um novo.",
    ) {
        super(message);
        this.name = "InvalidResetTokenError";
    }
}

// ------------------------------------------------------------
// FEAT-0008 — Solicitações de cadastro pendentes de aprovação
// ------------------------------------------------------------

/** Token do link de decisão não existe. Mesma superfície de erro que expirado — não revela qual. */
export class SignupRequestNotFoundError extends Error {
    readonly code = AuthErrorCode.SIGNUP_REQUEST_NOT_FOUND;

    constructor(message = "Solicitação não encontrada.") {
        super(message);
        this.name = "SignupRequestNotFoundError";
    }
}

/** Link de decisão passou dos 7 dias de validade (FR-009). */
export class SignupRequestExpiredError extends Error {
    readonly code = AuthErrorCode.SIGNUP_REQUEST_EXPIRED;

    constructor(
        message = "Este link expirou. A solicitação pode ser decidida pelo painel administrativo.",
    ) {
        super(message);
        this.name = "SignupRequestExpiredError";
    }
}

/** Alguém já decidiu esta solicitação — transição atômica, FR-010/SC-004. */
export class SignupRequestAlreadyDecidedError extends Error {
    readonly code = AuthErrorCode.SIGNUP_REQUEST_ALREADY_DECIDED;

    constructor(message = "Esta solicitação já foi decidida.") {
        super(message);
        this.name = "SignupRequestAlreadyDecidedError";
    }
}
