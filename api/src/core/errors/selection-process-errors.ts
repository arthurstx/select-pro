import { SelectionProcessAdminErrorCode } from "shared";

// Erro de domínio da correção de processos seletivos (FEAT-0017). `id`
// inexistente reaproveita `SelectionProcessNotFoundError`, já existente em
// `checkin-errors.ts` — só o conflito de `label` é novo.

export class SelectionProcessLabelAlreadyExistsError extends Error {
    readonly code = SelectionProcessAdminErrorCode.SELECTION_PROCESS_LABEL_ALREADY_EXISTS;
    readonly field = "label";

    constructor(message = "Já existe um processo seletivo com este rótulo.") {
        super(message);
        this.name = "SelectionProcessLabelAlreadyExistsError";
    }
}
