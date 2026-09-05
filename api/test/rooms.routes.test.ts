import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { RoomType } from "shared";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, status codes, envelope de erro. A
// lógica de negócio está em rooms.service.test.ts (mesma divisão do resto
// do projeto). Storage do D1 não é isolado por `it()` — dados únicos por
// chamada (mesmo padrão de dashboard.routes.test.ts/signup-requests.routes.test.ts).

const JWT_SECRET = "segredo-de-teste-suficientemente-longo";
const FRONT_ORIGIN = "https://app.exemplo.test";

function testEnv(overrides: Record<string, unknown> = {}) {
    return { ...env, JWT_SECRET, FRONT_ORIGIN, ...overrides } as unknown as CloudflareBindings;
}

async function call(request: Request, envOverrides: Record<string, unknown> = {}) {
    const ctx = createExecutionContext();
    const response = await app.fetch(request, testEnv(envOverrides), ctx);
    await waitOnExecutionContext(ctx);

    return response;
}

function authed(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string): Record<string, string> {
    return { ...authed(token), "content-type": "application/json" };
}

let counter = 0;

async function tokenFor(role: "admin" | "avaliador"): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, role, `user-rooms-rota-${counter}@example.com`, `Membro Rooms ${counter}`)
        .run();

    return signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
}

function uniqueName(): string {
    counter += 1;
    return `Sala Rota ${counter}`;
}

async function createRoom(admin: string, overrides: { name?: string; type?: RoomType } = {}) {
    const response = await call(
        new Request("http://local.test/rooms", {
            method: "POST",
            headers: jsonHeaders(admin),
            body: JSON.stringify({ name: overrides.name ?? uniqueName(), type: overrides.type ?? "comum" }),
        }),
    );
    const body = await response.json<{ data: { id: string; name: string; type: RoomType } }>();
    return body.data;
}

// ============================================================
// GET /rooms
// ============================================================

describe("GET /rooms (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/rooms"));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador — FR-010, leitura também é admin-only", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(new Request("http://local.test/rooms", { headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("200 com admin, e a sala criada aparece na lista", async () => {
        const admin = await tokenFor("admin");
        const room = await createRoom(admin);

        const response = await call(new Request("http://local.test/rooms", { headers: authed(admin) }));
        const body = await response.json<{ data: { name: string }[] }>();

        expect(response.status).toBe(200);
        expect(body.data.map((r) => r.name)).toContain(room.name);
    });
});

// ============================================================
// POST /rooms
// ============================================================

describe("POST /rooms (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(
            new Request("http://local.test/rooms", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: uniqueName(), type: "comum" }),
            }),
        );
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request("http://local.test/rooms", {
                method: "POST",
                headers: jsonHeaders(token),
                body: JSON.stringify({ name: uniqueName(), type: "comum" }),
            }),
        );
        expect(response.status).toBe(403);
    });

    it("201 com admin", async () => {
        const admin = await tokenFor("admin");
        const response = await call(
            new Request("http://local.test/rooms", {
                method: "POST",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ name: uniqueName(), type: "comum" }),
            }),
        );
        const body = await response.json<{ data: { hostCount: number; maxGroups: number } }>();

        expect(response.status).toBe(201);
        expect(body.data.hostCount).toBe(1);
        expect(body.data.maxGroups).toBe(2);
    });

    it("FR-004 - classificação inválida responde 400", async () => {
        const admin = await tokenFor("admin");
        const response = await call(
            new Request("http://local.test/rooms", {
                method: "POST",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ name: uniqueName(), type: "auditorio" }),
            }),
        );

        expect(response.status).toBe(400);
    });

    it("FR-005 - nome duplicado responde 409", async () => {
        const admin = await tokenFor("admin");
        const name = uniqueName();
        await createRoom(admin, { name });

        const response = await call(
            new Request("http://local.test/rooms", {
                method: "POST",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ name, type: "anfiteatro" }),
            }),
        );

        expect(response.status).toBe(409);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("ROOM_NAME_ALREADY_EXISTS");
    });
});

// ============================================================
// PUT /rooms/:id
// ============================================================

describe("PUT /rooms/:id (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const admin = await tokenFor("admin");
        const room = await createRoom(admin);

        const response = await call(
            new Request(`http://local.test/rooms/${room.id}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: room.name, type: "anfiteatro" }),
            }),
        );
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const admin = await tokenFor("admin");
        const avaliador = await tokenFor("avaliador");
        const room = await createRoom(admin);

        const response = await call(
            new Request(`http://local.test/rooms/${room.id}`, {
                method: "PUT",
                headers: jsonHeaders(avaliador),
                body: JSON.stringify({ name: room.name, type: "anfiteatro" }),
            }),
        );
        expect(response.status).toBe(403);
    });

    it("200 com admin, classificação recalculada", async () => {
        const admin = await tokenFor("admin");
        const room = await createRoom(admin, { type: "comum" });

        const response = await call(
            new Request(`http://local.test/rooms/${room.id}`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ name: room.name, type: "anfiteatro" }),
            }),
        );
        const body = await response.json<{ data: { hostCount: number; maxGroups: number } }>();

        expect(response.status).toBe(200);
        expect(body.data).toMatchObject({ hostCount: 2, maxGroups: 4 });
    });

    it("404 para id inexistente", async () => {
        const admin = await tokenFor("admin");

        const response = await call(
            new Request(`http://local.test/rooms/${crypto.randomUUID()}`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ name: uniqueName(), type: "comum" }),
            }),
        );
        expect(response.status).toBe(404);
    });

    it("409 ao renomear para nome já usado por outra sala", async () => {
        const admin = await tokenFor("admin");
        const roomA = await createRoom(admin);
        const roomB = await createRoom(admin);

        const response = await call(
            new Request(`http://local.test/rooms/${roomB.id}`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ name: roomA.name, type: "comum" }),
            }),
        );
        expect(response.status).toBe(409);
    });
});

// ============================================================
// DELETE /rooms/:id
// ============================================================

describe("DELETE /rooms/:id (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const admin = await tokenFor("admin");
        const room = await createRoom(admin);

        const response = await call(
            new Request(`http://local.test/rooms/${room.id}`, { method: "DELETE" }),
        );
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const admin = await tokenFor("admin");
        const avaliador = await tokenFor("avaliador");
        const room = await createRoom(admin);

        const response = await call(
            new Request(`http://local.test/rooms/${room.id}`, { method: "DELETE", headers: authed(avaliador) }),
        );
        expect(response.status).toBe(403);
    });

    it("204 com admin", async () => {
        const admin = await tokenFor("admin");
        const room = await createRoom(admin);

        const response = await call(
            new Request(`http://local.test/rooms/${room.id}`, { method: "DELETE", headers: authed(admin) }),
        );
        expect(response.status).toBe(204);
    });

    it("404 para id inexistente", async () => {
        const admin = await tokenFor("admin");

        const response = await call(
            new Request(`http://local.test/rooms/${crypto.randomUUID()}`, {
                method: "DELETE",
                headers: authed(admin),
            }),
        );
        expect(response.status).toBe(404);
    });

    it("FR-009 - 409 quando há grupo vinculado", async () => {
        const admin = await tokenFor("admin");
        const room = await createRoom(admin);

        // FEAT-0012: `groups` ganhou `process_id NOT NULL` — qualquer linha semeada da migration serve aqui.
        await env.DB.prepare(
            "INSERT INTO groups (id, process_id, room_id, modality, name) VALUES (?, (SELECT id FROM selection_processes LIMIT 1), ?, 'presencial', ?)",
        )
            .bind(crypto.randomUUID(), room.id, "Grupo de teste")
            .run();

        const response = await call(
            new Request(`http://local.test/rooms/${room.id}`, { method: "DELETE", headers: authed(admin) }),
        );

        expect(response.status).toBe(409);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("ROOM_HAS_GROUPS");
    });
});
