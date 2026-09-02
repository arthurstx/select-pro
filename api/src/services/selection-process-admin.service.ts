import type { SelectionProcessAdminSummary, UpdateSelectionProcessAdminDTO } from "shared";
import type { SelectionProcessRow } from "shared";

import { type Either, left, right } from "../core/either";
import { SelectionProcessNotFoundError } from "../core/errors/checkin-errors";
import { SelectionProcessLabelAlreadyExistsError } from "../core/errors/selection-process-errors";
import { logger } from "../lib/logger";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

export type SelectionProcessAdminUpdateError = SelectionProcessNotFoundError | SelectionProcessLabelAlreadyExistsError;

/**
 * FEAT-0017 — correção pontual de processos seletivos (listar + editar). A
 * criação sob demanda continua exclusivamente em `SelectionProcessRepository.resolveCurrent()`
 * (regra semestral fixa em código) — este service nunca cria linha nova.
 */
export class SelectionProcessAdminService {
    constructor(private readonly repository: SelectionProcessRepository) {}

    async list(): Promise<SelectionProcessAdminSummary[]> {
        const rows = await this.repository.listAll();
        return rows.map(toSummary);
    }

    async update(
        id: string,
        input: UpdateSelectionProcessAdminDTO,
    ): Promise<Either<SelectionProcessAdminUpdateError, SelectionProcessAdminSummary>> {
        const existing = await this.repository.findById(id);
        if (!existing) {
            logger.warn("selection_process_admin.update.not_found", { selectionProcessId: id });
            return left(new SelectionProcessNotFoundError());
        }

        if (input.label !== existing.label) {
            const conflicting = await this.repository.findByLabel(input.label);
            if (conflicting && conflicting.id !== id) {
                logger.warn("selection_process_admin.update.label_conflict", { selectionProcessId: id, label: input.label });
                return left(new SelectionProcessLabelAlreadyExistsError());
            }
        }

        let row: SelectionProcessRow | null;
        try {
            row = await this.repository.update({
                id,
                label: input.label,
                starts_at: input.starts_at,
                ends_at: input.ends_at,
            });
        } catch (err) {
            // Corrida entre a checagem acima e o UPDATE — o UNIQUE(label) fecha a janela.
            if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
                logger.warn("selection_process_admin.update.race_label_conflict", {
                    selectionProcessId: id,
                    label: input.label,
                });
                return left(new SelectionProcessLabelAlreadyExistsError());
            }
            throw err;
        }

        if (!row) {
            // Corrida: existia no findById acima, sumiu antes do UPDATE.
            logger.warn("selection_process_admin.update.vanished", { selectionProcessId: id });
            return left(new SelectionProcessNotFoundError());
        }

        logger.info("selection_process_admin.update.success", { selectionProcessId: id });
        return right(toSummary(row));
    }
}

function toSummary(row: SelectionProcessRow): SelectionProcessAdminSummary {
    return { id: row.id, label: row.label, starts_at: row.starts_at, ends_at: row.ends_at };
}
