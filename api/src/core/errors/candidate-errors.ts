import { CandidateErrorCode } from "shared";

// Erros de domínio do fluxo de inscrição de candidato (FEAT-0001 v3.0, seção 5).

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

/** Trava temporária de prazo de inscrição — ver `lib/candidate-registration-deadline.ts`. */
export class RegistrationClosedError extends Error {
    readonly code = CandidateErrorCode.REGISTRATION_CLOSED;

    constructor(message = "As inscrições estão encerradas") {
        super(message);
        this.name = "RegistrationClosedError";
    }
}
