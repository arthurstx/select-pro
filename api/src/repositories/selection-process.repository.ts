import type { NewSelectionProcess, SelectionProcessRow } from "shared";

import { selectionProcessWindowFor, type SelectionProcessWindow } from "../lib/selection-process-window";

/**
 * Edições do processo seletivo. Nasceu dentro de `CheckinRepository`
 * (FEAT-0005) e saiu de lá na FEAT-0006, quando a inscrição também passou a
 * precisar da edição corrente para carimbar `candidates.process_id`.
 *
 * A lógica é do domínio de processo seletivo, não do check-in — e duplicar
 * criaria duas regras de calendário divergindo em silêncio.
 */
export class SelectionProcessRepository {
    constructor(private readonly db: D1Database) {}

    /**
     * Resolve a edição de `now`, criando-a se faltar. Idempotente: lê
     * primeiro (só a primeira requisição de cada semestre escreve), insere
     * com `ON CONFLICT (label) DO NOTHING` se ausente, e relê — o
     * `UNIQUE(label)` resolve a corrida entre duas requisições simultâneas.
     */
    async resolveCurrent(now: Date = new Date()): Promise<SelectionProcessRow> {
        return this.resolve(selectionProcessWindowFor(now));
    }

    async resolve(window: SelectionProcessWindow): Promise<SelectionProcessRow> {
        const existing = await this.findByLabel(window.label);
        if (existing) return existing;

        const newProcess: NewSelectionProcess = {
            id: crypto.randomUUID(),
            label: window.label,
            starts_at: window.startsAt,
            ends_at: window.endsAt,
        };

        await this.db
            .prepare(
                `INSERT INTO selection_processes (id, label, starts_at, ends_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT (label) DO NOTHING`,
            )
            .bind(newProcess.id, newProcess.label, newProcess.starts_at, newProcess.ends_at)
            .run();

        const row = await this.findByLabel(window.label);
        if (!row) {
            // Guarda de invariante (FEAT-0005, seção 4.1.1) — não deveria ser alcançável.
            throw new Error(`Falha ao resolver o processo seletivo ${window.label}`);
        }

        return row;
    }

    async findById(id: string): Promise<SelectionProcessRow | null> {
        return this.db
            .prepare("SELECT * FROM selection_processes WHERE id = ?")
            .bind(id)
            .first<SelectionProcessRow>();
    }

    /**
     * Catálogo do seletor de edição (FEAT-0007). Ordena por `starts_at DESC`,
     * não por `label`: a ordenação alfabética de "2026.1"/"2026.2" coincide
     * hoje, mas é coincidência do formato, não garantia.
     */
    async listAll(): Promise<SelectionProcessRow[]> {
        const { results } = await this.db
            .prepare("SELECT * FROM selection_processes ORDER BY starts_at DESC")
            .all<SelectionProcessRow>();

        return results ?? [];
    }

    async findByLabel(label: string): Promise<SelectionProcessRow | null> {
        return this.db
            .prepare("SELECT * FROM selection_processes WHERE label = ?")
            .bind(label)
            .first<SelectionProcessRow>();
    }

    /**
     * FEAT-0017 — correção pontual de `label`/`starts_at`/`ends_at`. `PUT`
     * substitui os três campos juntos (mesmo padrão de `RoomsRepository.update`).
     */
    async update(update: {
        id: string;
        label: string;
        starts_at: string;
        ends_at: string;
    }): Promise<SelectionProcessRow | null> {
        return this.db
            .prepare("UPDATE selection_processes SET label = ?, starts_at = ?, ends_at = ? WHERE id = ? RETURNING *")
            .bind(update.label, update.starts_at, update.ends_at, update.id)
            .first<SelectionProcessRow>();
    }
}
