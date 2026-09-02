import { EvaluationErrorCode } from "shared";

// Erros de domínio da avaliação de candidatos (FEAT-0013).
// NO_ACTIVE_SELECTION_PROCESS é reaproveitado de checkin-errors.ts,
// CANDIDATE_NOT_FOUND de checkin-errors.ts também — não duplicados aqui.

/** FR-001/FR-002 — avaliador logado não está alocado a nenhum grupo presencial da edição corrente. */
export class NotInAnyGroupError extends Error {
    readonly code = EvaluationErrorCode.NOT_IN_ANY_GROUP;

    constructor(message = "Você não está alocado a nenhum grupo nesta edição.") {
        super(message);
        this.name = "NotInAnyGroupError";
    }
}

/** FR-003 — candidato existe e está em algum grupo, mas não no mesmo grupo do avaliador. */
export class CandidateNotInEvaluatorGroupError extends Error {
    readonly code = EvaluationErrorCode.CANDIDATE_NOT_IN_EVALUATOR_GROUP;

    constructor(message = "Este candidato não está no seu grupo.") {
        super(message);
        this.name = "CandidateNotInEvaluatorGroupError";
    }
}
