import { CandidateErrorCode } from "shared";

/**
 * Erros de domínio do fluxo de inscrição de candidato (FEAT-0001 v3.0, seção 5).
 * Os dois erros cobrem tanto E1/E2 (checagem prévia contra o banco) quanto E5
 * (constraint `unique` violada no insert, em inscrições concorrentes) — mesma
 * condição de domínio, dois pontos de detecção diferentes.
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
