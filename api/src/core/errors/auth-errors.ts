import { AuthErrorCode } from "shared";

/**
 * Erros de domínio do cadastro e da autenticação de membro (FEAT-0003, seção 5).
 *
 * Cada classe carrega o `code` que vai no envelope de erro e, quando o erro é
 * atribuível a um campo do formulário, o `field`. O status HTTP fica na rota:
 * é a única camada que deveria conhecer HTTP.
 */

export class EmailAlreadyRegisteredError extends Error {
    readonly code = AuthErrorCode.EMAIL_ALREADY_REGISTERED;
    readonly field = "email";

    constructor(message = "Já existe uma conta com este email") {
        super(message);
        this.name = "EmailAlreadyRegisteredError";
    }
}

/** E2 — o email não consta em `members` na Supabase. Definitivo: tentar de novo não muda. */
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

/** E3 — o membro existe, mas o status não está em `ELIGIBLE_MEMBER_STATUSES`. */
export class MemberNotActiveError extends Error {
    readonly code = AuthErrorCode.MEMBER_NOT_ACTIVE;
    readonly field = "email";

    constructor(
        message = "Seu cadastro de membro não está ativo. Procure a diretoria para regularizar o acesso.",
    ) {
        super(message);
        this.name = "MemberNotActiveError";
    }
}

/**
 * E5 — a Supabase não respondeu (timeout, rede ou não-2xx).
 *
 * **Transitório**, ao contrário de E2 e E3: a UI deve sugerir tentar de novo.
 * Nenhuma linha é gravada no D1 quando este erro acontece — o cadastro falha
 * fechado, porque criar a conta "para validar depois" transformaria uma
 * indisponibilidade momentânea em conta indevida permanente.
 */
export class MemberDirectoryUnavailableError extends Error {
    readonly code = AuthErrorCode.MEMBER_DIRECTORY_UNAVAILABLE;

    constructor(
        message = "Não foi possível verificar seu cadastro de membro agora. Tente novamente em alguns instantes.",
    ) {
        super(message);
        this.name = "MemberDirectoryUnavailableError";
    }
}

/**
 * E7 — usado tanto para email inexistente quanto para senha errada.
 *
 * É uma classe só de propósito: se houvesse duas, mais cedo ou mais tarde
 * alguém daria mensagens diferentes a elas e o login viraria um verificador de
 * contas. Com uma classe, a resposta é byte a byte idêntica por construção.
 */
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

/**
 * E9 e E10 — token não encontrado, expirado **ou** reuso detectado.
 *
 * O reuso não tem erro próprio, e isso é a decisão da seção 8.4: para o cliente
 * legítimo os três casos são "sua sessão acabou, faça login". A diferença do
 * reuso — revogar a família inteira — acontece no service e aparece no log,
 * nunca na resposta, senão entregaria informação a quem estivesse testando
 * tokens roubados.
 */
export class InvalidRefreshTokenError extends Error {
    readonly code = AuthErrorCode.INVALID_REFRESH_TOKEN;

    constructor(message = "Sessão expirada. Faça login novamente.") {
        super(message);
        this.name = "InvalidRefreshTokenError";
    }
}

/**
 * E11 — access token malformado, com assinatura inválida, ou apontando para um
 * usuário que não existe mais.
 *
 * Distinto de "expirado" de propósito: `TOKEN_EXPIRED` manda o front renovar e
 * repetir a requisição, este manda ir para o login. Sem a distinção, a
 * expiração normal (a cada 15 minutos) seria lida como fim de sessão e o membro
 * seria deslogado o tempo todo.
 */
export class InvalidAccessTokenError extends Error {
    readonly code = AuthErrorCode.INVALID_TOKEN;

    constructor(message = "Sessão inválida. Faça login novamente.") {
        super(message);
        this.name = "InvalidAccessTokenError";
    }
}

/** E11 — access token expirado. O front deve chamar `/auth/refresh`, **não** deslogar. */
export class AccessTokenExpiredError extends Error {
    readonly code = AuthErrorCode.TOKEN_EXPIRED;

    constructor(message = "Sessão expirada. Renove e tente novamente.") {
        super(message);
        this.name = "AccessTokenExpiredError";
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
