import { GroupErrorCode } from "shared";

// Erros de domínio da organização automática de grupos (FEAT-0012).
// NO_ACTIVE_SELECTION_PROCESS é reaproveitado de checkin-errors.ts — não duplicado aqui.

/** FR-002/FR-012 — `POST /groups/organize` sem nenhum candidato com check-in feito na edição. */
export class NoCandidatesPresentError extends Error {
    readonly code = GroupErrorCode.NO_CANDIDATES_PRESENT;

    constructor(message = "Nenhum candidato fez check-in nesta edição ainda.") {
        super(message);
        this.name = "NoCandidatesPresentError";
    }
}

/** FR-012 — há candidato presencial presente, mas nenhuma sala cadastrada (FEAT-0011). */
export class NoRoomsAvailableError extends Error {
    readonly code = GroupErrorCode.NO_ROOMS_AVAILABLE;

    constructor(message = "Não há nenhuma sala cadastrada para organizar os grupos presenciais.") {
        super(message);
        this.name = "NoRoomsAvailableError";
    }
}

/** `groupId` de um `PATCH` que não existe na edição corrente. */
export class GroupNotFoundError extends Error {
    readonly code = GroupErrorCode.GROUP_NOT_FOUND;

    constructor(message = "Grupo não encontrado.") {
        super(message);
        this.name = "GroupNotFoundError";
    }
}

/** `candidateId` do `PATCH .../candidates/{id}` não está alocado a nenhum grupo da edição corrente. */
export class CandidateNotAllocatedError extends Error {
    readonly code = GroupErrorCode.CANDIDATE_NOT_ALLOCATED;

    constructor(message = "Este candidato não está alocado a nenhum grupo desta edição.") {
        super(message);
        this.name = "CandidateNotAllocatedError";
    }
}

/** `userId` do `PATCH .../evaluators/{id}` não está alocado a nenhum grupo da edição corrente. */
export class EvaluatorNotAllocatedError extends Error {
    readonly code = GroupErrorCode.EVALUATOR_NOT_ALLOCATED;

    constructor(message = "Este avaliador/host não está alocado a nenhum grupo desta edição.") {
        super(message);
        this.name = "EvaluatorNotAllocatedError";
    }
}

/** FR-003 — mover entre grupo presencial e online é invariante rígida, sempre bloqueado (nunca um aviso). */
export class GroupModalityMismatchError extends Error {
    readonly code = GroupErrorCode.GROUP_MODALITY_MISMATCH;

    constructor(message = "Não é possível mover entre um grupo presencial e um grupo online.") {
        super(message);
        this.name = "GroupModalityMismatchError";
    }
}
