import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { SelectionProcessAdminService } from "../src/services/selection-process-admin.service";

// Testes do service contra o D1 real do miniflare (mesmo padrão do resto do projeto).
// Sem `create()` no repositório (a criação continua só via `resolveCurrent()`) — os
// processos de teste são semeados direto via SQL.

let counter = 0;

function uniqueLabel(): string {
    counter += 1;
    return `TesteFEAT0017.${counter}`;
}

async function seedProcess(label: string, starts_at: string, ends_at: string): Promise<string> {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO selection_processes (id, label, starts_at, ends_at) VALUES (?, ?, ?, ?)")
        .bind(id, label, starts_at, ends_at)
        .run();
    return id;
}

describe("SelectionProcessAdminService", () => {
    let repository: SelectionProcessRepository;
    let service: SelectionProcessAdminService;

    beforeEach(() => {
        repository = new SelectionProcessRepository(env.DB);
        service = new SelectionProcessAdminService(repository);
    });

    // ============================================================
    // list
    // ============================================================

    describe("list", () => {
        it("devolve todos os processos, ordenados por starts_at DESC", async () => {
            const oldLabel = uniqueLabel();
            const newLabel = uniqueLabel();
            const midLabel = uniqueLabel();
            await seedProcess(oldLabel, "2020-01-01", "2020-07-31 23:59:59");
            await seedProcess(newLabel, "2030-08-01", "2030-12-31 23:59:59");
            await seedProcess(midLabel, "2025-01-01", "2025-07-31 23:59:59");

            const rows = await service.list();
            const labels = rows.map((r) => r.label);
            const oldIndex = labels.indexOf(oldLabel);
            const newIndex = labels.indexOf(newLabel);
            const midIndex = labels.indexOf(midLabel);

            // A mais recente (newLabel) vem antes da intermediária, que vem antes da mais antiga.
            expect(newIndex).toBeLessThan(midIndex);
            expect(midIndex).toBeLessThan(oldIndex);
        });
    });

    // ============================================================
    // update
    // ============================================================

    describe("update", () => {
        it("corrige label/starts_at/ends_at e devolve o valor atualizado", async () => {
            const label = uniqueLabel();
            const id = await seedProcess(label, "2026-01-01", "2026-07-31 23:59:59");

            const result = await service.update(id, {
                label,
                starts_at: "2026-01-15",
                ends_at: "2026-07-31 23:59:59",
            });

            expect(result.isRight()).toBe(true);
            if (result.isRight()) {
                expect(result.value.starts_at).toBe("2026-01-15");
            }
        });

        it("FR-004 - label já usado por outro processo é recusado, sem gravar", async () => {
            const labelA = uniqueLabel();
            const labelB = uniqueLabel();
            await seedProcess(labelA, "2026-01-01", "2026-07-31 23:59:59");
            const idB = await seedProcess(labelB, "2027-01-01", "2027-07-31 23:59:59");

            const result = await service.update(idB, {
                label: labelA,
                starts_at: "2027-01-01",
                ends_at: "2027-07-31 23:59:59",
            });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("SELECTION_PROCESS_LABEL_ALREADY_EXISTS");

            const row = await repository.findById(idB);
            expect(row?.label).toBe(labelB);
        });

        it("FR-005 - id inexistente retorna SELECTION_PROCESS_NOT_FOUND", async () => {
            const result = await service.update(crypto.randomUUID(), {
                label: uniqueLabel(),
                starts_at: "2026-01-01",
                ends_at: "2026-07-31 23:59:59",
            });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("SELECTION_PROCESS_NOT_FOUND");
        });

        it("renomear para o próprio label atual não é tratado como conflito", async () => {
            const label = uniqueLabel();
            const id = await seedProcess(label, "2026-01-01", "2026-07-31 23:59:59");

            const result = await service.update(id, {
                label,
                starts_at: "2026-02-01",
                ends_at: "2026-07-31 23:59:59",
            });

            expect(result.isRight()).toBe(true);
        });
    });
});
