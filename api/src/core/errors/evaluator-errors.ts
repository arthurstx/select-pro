import { EvaluatorErrorCode } from "shared";

// Erros de domínio de avaliadores/hosts (FEAT-0009).
// NO_ACTIVE_SELECTION_PROCESS é reaproveitado de checkin-errors.ts (R3) — não duplicado aqui.

/** `userId` do `PUT .../role` sem conta de avaliador ativa (inexistente, admin, ou desativado). */
export class EvaluatorNotFoundError extends Error {
    readonly code = EvaluatorErrorCode.EVALUATOR_NOT_FOUND;

    constructor(message = "Avaliador não encontrado") {
        super(message);
        this.name = "EvaluatorNotFoundError";
    }
}
