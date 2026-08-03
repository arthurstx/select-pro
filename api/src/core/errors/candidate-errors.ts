import { CandidateErrorCode } from "shared";

/**
 * Erros de domínio do fluxo de registro de candidato (FEAT-0001, seção 5).
 * `EmailAlreadyRegisteredError`/`PhoneAlreadyRegisteredError` cobrem tanto
 * E1/E2 (pre-register, contra candidatos confirmados) quanto E10
 * (confirm-otc, constraint unique violada no insert) — mesma condição de
 * domínio, dois pontos de detecção diferentes.
 */

export class EmailAlreadyRegisteredError extends Error {
    readonly code = CandidateErrorCode.EMAIL_ALREADY_REGISTERED;
    readonly field = "email";

    constructor(message = "Email já cadastrado") {
        super(message);
        this.name = "EmailAlreadyRegisteredError";
    }
}

export class PhoneAlreadyRegisteredError extends Error {
    readonly code = CandidateErrorCode.PHONE_ALREADY_REGISTERED;
    readonly field = "phone";

    constructor(message = "Telefone já cadastrado") {
        super(message);
        this.name = "PhoneAlreadyRegisteredError";
    }
}

/** E5 — entrada não existe mais no KV (TTL vencido ou pendingId nunca existiu). */
export class OtcNotFoundError extends Error {
    readonly code = CandidateErrorCode.OTC_NOT_FOUND;

    constructor(message = "Código expirado ou não encontrado") {
        super(message);
        this.name = "OtcNotFoundError";
    }
}

/** E6 — código informado não bate com o hash armazenado. */
export class InvalidOtcError extends Error {
    readonly code = CandidateErrorCode.INVALID_OTC;
    readonly field = "code";

    constructor(message = "Código inválido") {
        super(message);
        this.name = "InvalidOtcError";
    }
}

/** E7 — entrada existe mas não é do tipo `confirm-email` (proteção interna). */
export class InvalidOtcTypeError extends Error {
    readonly code = CandidateErrorCode.INVALID_OTC_TYPE;

    constructor(message = "Código inválido") {
        super(message);
        this.name = "InvalidOtcTypeError";
    }
}

/** E9 — tentativas excedidas; a entrada já foi deletada do KV pelo service. */
export class TooManyAttemptsError extends Error {
    readonly code = CandidateErrorCode.TOO_MANY_ATTEMPTS;

    constructor(message = "Número de tentativas excedido, inicie um novo cadastro") {
        super(message);
        this.name = "TooManyAttemptsError";
    }
}
