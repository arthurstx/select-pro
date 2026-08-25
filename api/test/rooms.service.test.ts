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
        it("grava e devolve hostCount/maxGroups calculados a partir da capacidade", async () => {
            const result = await service.create({ name: uniqueName(), size: 40 });

            expect(result.isRight()).toBe(true);
            if (result.isRight()) {
                expect(result.value.size).toBe(40);
                expect(result.value.hostCount).toBe(1);
                expect(result.value.maxGroups).toBe(2);
            }
        });

        it("FR-005 - nome já existente é recusado, sem inserir linha nova", async () => {
            const name = uniqueName();
            await service.create({ name, size: 40 });

            const second = await service.create({ name, size: 65 });

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
        it("devolve todas as salas com o cálculo correto por faixa", async () => {
            const a = uniqueName();
            const b = uniqueName();
            await service.create({ name: a, size: 40 });
            await service.create({ name: b, size: 120 });

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
        it("recalcula hostCount/maxGroups ao mudar size, cruzando faixa", async () => {
            const created = await service.create({ name: uniqueName(), size: 45 });
            if (!created.isRight()) throw new Error("setup falhou");

            const updated = await service.update(created.value.id, { name: created.value.name, size: 60 });

            expect(updated.isRight()).toBe(true);
            if (updated.isRight()) {
                expect(updated.value.size).toBe(60);
                expect(updated.value.hostCount).toBe(2);
                expect(updated.value.maxGroups).toBe(3);
            }
        });

        it("renomear para nome já usado por outra sala é recusado", async () => {
            const nameA = uniqueName();
            const nameB = uniqueName();
            await service.create({ name: nameA, size: 40 });
            const roomB = await service.create({ name: nameB, size: 40 });
            if (!roomB.isRight()) throw new Error("setup falhou");

            const result = await service.update(roomB.value.id, { name: nameA, size: 40 });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("ROOM_NAME_ALREADY_EXISTS");
        });

        it("id inexistente retorna ROOM_NOT_FOUND", async () => {
            const result = await service.update(crypto.randomUUID(), { name: uniqueName(), size: 40 });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("ROOM_NOT_FOUND");
        });
    });

    // ============================================================
    // delete
    // ============================================================

    describe("delete", () => {
        it("remove sala sem grupo vinculado", async () => {
            const created = await service.create({ name: uniqueName(), size: 40 });
            if (!created.isRight()) throw new Error("setup falhou");

            const result = await service.delete(created.value.id);

            expect(result.isRight()).toBe(true);
            const row = await repository.findById(created.value.id);
            expect(row).toBeNull();
        });

        it("FR-009 - sala com grupo vinculado não pode ser excluída", async () => {
            const created = await service.create({ name: uniqueName(), size: 40 });
            if (!created.isRight()) throw new Error("setup falhou");

            // Seed direto via SQL: a feature 012 (que popularia `groups` de
            // verdade) ainda não existe — simula o vínculo que ela criaria.
            await env.DB.prepare("INSERT INTO groups (id, room_id, name) VALUES (?, ?, ?)")
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
