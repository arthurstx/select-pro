import { MemberCheckinErrorCode } from "shared";

// Erros de domínio do check-in de membros (FEAT-0010).
// NO_ACTIVE_SELECTION_PROCESS (FR-008) é reaproveitado de checkin-errors.ts,
// EVALUATOR_NOT_FOUND (userId que não é avaliador/host elegível) de
// evaluator-errors.ts — não duplicados aqui.

/** FR-009 — edição corrente existe, mas nenhum avaliador/host foi atribuído a ela ainda (FEAT-0009). */
export class NoEvaluatorsInEditionError extends Error {
    readonly code = MemberCheckinErrorCode.NO_EVALUATORS_IN_EDITION;

    constructor(message = "Nenhum avaliador ou host foi atribuído a esta edição ainda") {
        super(message);
        this.name = "NoEvaluatorsInEditionError";
    }
}
