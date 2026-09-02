import { CheckinErrorCode } from "shared";

// Erros de domínio do check-in de candidatos (FEAT-0005, seção 5).
// O status HTTP fica na rota, não aqui — mesma convenção de candidate-errors.ts.

/** E1 — `id` da rota não corresponde a nenhuma linha de `candidates`. */
export class CandidateNotFoundError extends Error {
    readonly code = CheckinErrorCode.CANDIDATE_NOT_FOUND;

    constructor(message = "Candidato não encontrado") {
        super(message);
        this.name = "CandidateNotFoundError";
    }
}

/**
 * E2 — guarda de invariante, não configuração faltando (FEAT-0005 v1.2,
 * seção 4.1.1): com a criação sob demanda, toda data cai em alguma edição.
 * Se isto for lançado em produção, é bug, não falta de cadastro.
 */
export class NoActiveSelectionProcessError extends Error {
    readonly code = CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS;

    constructor(message = "Não há processo seletivo em andamento no momento") {
        super(message);
        this.name = "NoActiveSelectionProcessError";
    }
}

/**
 * FEAT-0007 E3 — `process_id` informado não corresponde a nenhuma edição.
 * Distinto de `NoActiveSelectionProcessError`: lá o sistema não conseguiu
 * resolver a edição de hoje (defeito nosso); aqui o cliente pediu uma edição
 * que não existe (404, e a UI volta para a corrente).
 */
export class SelectionProcessNotFoundError extends Error {
    readonly code = CheckinErrorCode.SELECTION_PROCESS_NOT_FOUND;

    constructor(message = "Edição do processo seletivo não encontrada") {
        super(message);
        this.name = "SelectionProcessNotFoundError";
    }
}

/** E3 — candidato existe, mas seu `created_at` está fora da janela do processo corrente. */
export class CandidateNotInActiveProcessError extends Error {
    readonly code = CheckinErrorCode.CANDIDATE_NOT_IN_ACTIVE_PROCESS;

    constructor(message = "Este candidato não pertence ao processo seletivo corrente") {
        super(message);
        this.name = "CandidateNotInActiveProcessError";
    }
}
