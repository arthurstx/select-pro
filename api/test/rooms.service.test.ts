import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { RoomsRepository } from "../src/repositories/rooms.repository";
import { RoomsService } from "../src/services/rooms.service";

// Testes do service contra o D1 real do miniflare (mesmo padrão do resto do projeto).

let counter = 0;

function uniqueName(): string {
    counter += 1;
    return `Sala Teste ${counter}`;
}

describe("RoomsService", () => {
    let repository: RoomsRepository;
    let service: RoomsService;

    beforeEach(() => {
        repository = new RoomsRepository(env.DB);
        service = new RoomsService(repository);
    });

    // ============================================================
    // create
    // ============================================================

    describe("create", () => {
        it("grava e devolve hostCount/maxGroups calculados a partir da classificação", async () => {
            const result = await service.create({ name: uniqueName(), type: "comum" });

            expect(result.isRight()).toBe(true);
            if (result.isRight()) {
                expect(result.value.type).toBe("comum");
                expect(result.value.hostCount).toBe(1);
                expect(result.value.maxGroups).toBe(2);
            }
        });

        it("FR-005 - nome já existente é recusado, sem inserir linha nova", async () => {
            const name = uniqueName();
            await service.create({ name, type: "comum" });

            const second = await service.create({ name, type: "anfiteatro" });

            expect(second.isLeft()).toBe(true);
            if (second.isLeft()) expect(second.value.code).toBe("ROOM_NAME_ALREADY_EXISTS");

            const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM rooms WHERE name = ?")
                .bind(name)
                .first<{ total: number }>();
            expect(rows?.total).toBe(1);
        });
    });

    // ============================================================
    // list
    // ============================================================

    describe("list", () => {
        it("devolve todas as salas com o cálculo correto por classificação", async () => {
            const a = uniqueName();
            const b = uniqueName();
            await service.create({ name: a, type: "comum" });
            await service.create({ name: b, type: "anfiteatro" });

            const rooms = await service.list();

            const roomA = rooms.find((r) => r.name === a);
            const roomB = rooms.find((r) => r.name === b);
            expect(roomA).toMatchObject({ hostCount: 1, maxGroups: 2 });
            expect(roomB).toMatchObject({ hostCount: 2, maxGroups: 4 });
        });
    });

    // ============================================================
    // update
    // ============================================================

    describe("update", () => {
        it("recalcula hostCount/maxGroups ao reclassificar a sala", async () => {
            const created = await service.create({ name: uniqueName(), type: "comum" });
            if (!created.isRight()) throw new Error("setup falhou");

            const updated = await service.update(created.value.id, { name: created.value.name, type: "anfiteatro" });

            expect(updated.isRight()).toBe(true);
            if (updated.isRight()) {
                expect(updated.value.type).toBe("anfiteatro");
                expect(updated.value.hostCount).toBe(2);
                expect(updated.value.maxGroups).toBe(4);
            }
        });

        it("renomear para nome já usado por outra sala é recusado", async () => {
            const nameA = uniqueName();
            const nameB = uniqueName();
            await service.create({ name: nameA, type: "comum" });
            const roomB = await service.create({ name: nameB, type: "comum" });
            if (!roomB.isRight()) throw new Error("setup falhou");

            const result = await service.update(roomB.value.id, { name: nameA, type: "comum" });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("ROOM_NAME_ALREADY_EXISTS");
        });

        it("id inexistente retorna ROOM_NOT_FOUND", async () => {
            const result = await service.update(crypto.randomUUID(), { name: uniqueName(), type: "comum" });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("ROOM_NOT_FOUND");
        });
    });

    // ============================================================
    // delete
    // ============================================================

    describe("delete", () => {
        it("remove sala sem grupo vinculado", async () => {
            const created = await service.create({ name: uniqueName(), type: "comum" });
            if (!created.isRight()) throw new Error("setup falhou");

            const result = await service.delete(created.value.id);

            expect(result.isRight()).toBe(true);
            const row = await repository.findById(created.value.id);
            expect(row).toBeNull();
        });

        it("FR-009 - sala com grupo vinculado não pode ser excluída", async () => {
            const created = await service.create({ name: uniqueName(), type: "comum" });
            if (!created.isRight()) throw new Error("setup falhou");

            // Seed direto via SQL — simula o vínculo que a FEAT-0012 cria de verdade.
            // `process_id NOT NULL`: qualquer linha semeada da migration serve aqui.
            await env.DB.prepare(
                "INSERT INTO groups (id, process_id, room_id, modality, name) VALUES (?, (SELECT id FROM selection_processes LIMIT 1), ?, 'presencial', ?)",
            )
                .bind(crypto.randomUUID(), created.value.id, "Grupo de teste")
                .run();

            const result = await service.delete(created.value.id);

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("ROOM_HAS_GROUPS");

            const row = await repository.findById(created.value.id);
            expect(row).not.toBeNull();
        });

        it("id inexistente retorna ROOM_NOT_FOUND", async () => {
            const result = await service.delete(crypto.randomUUID());

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("ROOM_NOT_FOUND");
        });
    });
});
