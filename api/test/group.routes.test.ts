import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { RoomType } from "shared";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, status codes, envelope de erro. A lógica
// de negócio está em group.service.test.ts (mesma divisão de
// member-checkin.routes.test.ts). Storage do D1 não é isolado por `it()` —
// todos os testes deste arquivo compartilham a edição corrente ("hoje",
// seed 2026.2) e a tabela `rooms` (global, sem escopo de edição). Por isso
// a ordem dos describes/its abaixo importa (ver comentários pontuais).
//
// FEAT-0018: `POST /groups/organize` virou `/organize/presencial` e `/organize/online`,
// independentes; + rotas novas de self-service (`/online/{id}/join`, `/online/me`) e
// atribuição manual (`PUT /online/{id}/evaluators/{userId}`).

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
    const { token } = await userAndTokenFor(role);
    return token;
}

async function userAndTokenFor(role: "admin" | "avaliador"): Promise<{ userId: string; token: string }> {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, role, `user-group-rota-${counter}@example.com`, `Membro Grupo ${counter}`)
        .run();

    // FEAT-0021: `group_evaluators`/`group.repository.ts` agora faz INNER JOIN com
    // `member_profiles` (pra trazer `memberStatus`) — todo avaliador de teste que pode acabar
    // num grupo precisa do perfil, mesma garantia que já vale em produção (FEAT-0003/0008).
    if (role === "avaliador") {
        await env.DB.prepare(
            `INSERT INTO member_profiles
                    (id, user_id, member_id, full_name, phone, course, semester, gender, ethnicity, status, manager, synced_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
            .bind(
                crypto.randomUUID(),
                id,
                crypto.randomUUID(),
                `Membro Grupo ${counter}`,
                `+5571998${String(counter).padStart(6, "0")}`,
                "eng-computacao",
                5,
                "outro",
                "nao-informado",
                "active",
                "2026-08-01 00:00:00",
            )
            .run();
    }

    const token = await signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
    return { userId: id, token };
}

async function insertCheckedCandidate(actorId: string, overrides: { online?: boolean } = {}) {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, (SELECT id FROM selection_processes WHERE ? BETWEEN starts_at AND ends_at), 'eng-computacao', 3, 'masculino', 'nao-informado', ?, ?, ?, ?)`,
    )
        .bind(id, "2026-08-26 12:00:00", `Candidato Grupo Rota ${counter}`, `candidato-grupo-rota-${counter}@example.com`, `+557198886${String(counter).padStart(4, "0")}`, "2026-08-26 12:00:00")
        .run();

    if (overrides.online) {
        await env.DB.prepare(
            `INSERT INTO candidate_applications
                    (id, candidate_id, referral_source, mej_acknowledged, experience, motivation, saturday_restriction, special_needs)
                  VALUES (?, ?, 'indicacao', 1, 'Nenhuma', 'Motivação', 1, 0)`,
        )
            .bind(crypto.randomUUID(), id)
            .run();
    }

    await env.DB.prepare(
        `INSERT INTO candidate_checkins (id, candidate_id, process_id, checked_in_by)
         VALUES (?, ?, (SELECT id FROM selection_processes WHERE '2026-08-26 12:00:00' BETWEEN starts_at AND ends_at), ?)`,
    )
        .bind(crypto.randomUUID(), id, actorId)
        .run();

    return id;
}

/** Avaliador presente (check-in de membro feito), com `member_profiles` — mesma exigência de `userAndTokenFor`. */
async function insertCheckedMember(actorId: string) {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, 'avaliador', ?, ?)")
        .bind(id, `avaliador-grp-rota-${counter}@example.com`, `Avaliador Grupo Rota ${counter}`)
        .run();

    await env.DB.prepare(
        `INSERT INTO member_profiles
                (id, user_id, member_id, full_name, phone, course, semester, gender, ethnicity, status, manager, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)`,
    )
        .bind(
            crypto.randomUUID(),
            id,
            crypto.randomUUID(),
            `Avaliador Grupo Rota ${counter}`,
            `+5571997${String(counter).padStart(6, "0")}`,
            "eng-computacao",
            5,
            "outro",
            "nao-informado",
            "2026-08-01 00:00:00",
        )
        .run();

    await env.DB.prepare(
        `INSERT INTO member_checkins (id, user_id, process_id, checked_in_by)
         VALUES (?, ?, (SELECT id FROM selection_processes WHERE '2026-08-26 12:00:00' BETWEEN starts_at AND ends_at), ?)`,
    )
        .bind(crypto.randomUUID(), id, actorId)
        .run();

    return id;
}

async function insertRoom(type: RoomType = "comum") {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO rooms (id, name, type) VALUES (?, ?, ?)`).bind(id, `Sala Grupo Rota ${counter}`, type).run();
    return id;
}

// ============================================================
// GET /groups
// ============================================================

describe("GET /groups (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups"));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(new Request("http://local.test/groups", { headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("200 com admin — `groups` é sempre um array (vazio antes de qualquer `organize`, aqui ou não)", async () => {
        const admin = await tokenFor("admin");
        const response = await call(new Request("http://local.test/groups", { headers: authed(admin) }));

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { groups: unknown[] } };
        expect(Array.isArray(body.data.groups)).toBe(true);
    });
});

// ============================================================
// POST /groups/organize/presencial
// ============================================================

describe("POST /groups/organize/presencial (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups/organize/presencial", { method: "POST" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request("http://local.test/groups/organize/presencial", { method: "POST", headers: authed(token) }),
        );
        expect(response.status).toBe(403);
    });

    it("409 NO_ROOMS_AVAILABLE com candidato presencial presente e nenhuma sala cadastrada ainda", async () => {
        const { userId, token } = await userAndTokenFor("admin");
        await insertCheckedCandidate(userId);

        const response = await call(
            new Request("http://local.test/groups/organize/presencial", {
                method: "POST",
                headers: jsonHeaders(token),
                body: JSON.stringify({}),
            }),
        );

        // Só é determinístico se nenhum teste anterior deste arquivo cadastrou sala — é o caso aqui (primeiro a tocar `rooms`).
        expect(response.status).toBe(409);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("NO_ROOMS_AVAILABLE");
    });

    it("200 organiza com sucesso depois de cadastrar uma sala — shape da resposta", async () => {
        const { userId, token } = await userAndTokenFor("admin");
        await insertRoom();
        await insertCheckedCandidate(userId);

        const response = await call(
            new Request("http://local.test/groups/organize/presencial", {
                method: "POST",
                headers: jsonHeaders(token),
                body: JSON.stringify({}),
            }),
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            data: { groups: { id: string; modality: string; candidates: unknown[] }[]; unallocatedCandidateCount: number };
        };
        expect(body.data.groups.length).toBeGreaterThan(0);
        expect(typeof body.data.unallocatedCandidateCount).toBe("number");
        expect(body.data.groups[0]).toHaveProperty("modality");
    });

    it("GET /groups depois de organizar reflete o resultado", async () => {
        const admin = await tokenFor("admin");
        const response = await call(new Request("http://local.test/groups", { headers: authed(admin) }));

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { groups: unknown[] } };
        // Alguma organização já rodou nos testes anteriores deste describe — a lista não é vazia.
        expect(body.data.groups.length).toBeGreaterThan(0);
    });

    it("evaluatorUserIds restringe quem entra no cálculo de avaliador (FEAT-0021)", async () => {
        const admin = await userAndTokenFor("admin");
        await insertRoom();
        await insertCheckedCandidate(admin.userId);
        const included = await insertCheckedMember(admin.userId);
        const excluded = await insertCheckedMember(admin.userId);

        const response = await call(
            new Request("http://local.test/groups/organize/presencial", {
                method: "POST",
                headers: jsonHeaders(admin.token),
                body: JSON.stringify({ evaluatorUserIds: [included] }),
            }),
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { groups: { evaluators: { userId: string }[] }[] } };
        const evaluatorIds = body.data.groups.flatMap((g) => g.evaluators.map((e) => e.userId));
        expect(evaluatorIds).toContain(included);
        expect(evaluatorIds).not.toContain(excluded);
    });
});

// ============================================================
// POST /groups/preview/presencial (FEAT-0021)
// ============================================================

describe("POST /groups/preview/presencial (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups/preview/presencial", { method: "POST" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request("http://local.test/groups/preview/presencial", { method: "POST", headers: authed(token) }),
        );
        expect(response.status).toBe(403);
    });

    it("200 devolve prévia com availableEvaluators, sem alterar GET /groups", async () => {
        const admin = await userAndTokenFor("admin");
        await insertRoom();
        await insertCheckedCandidate(admin.userId);
        await insertCheckedMember(admin.userId);

        const before = await call(new Request("http://local.test/groups", { headers: authed(admin.token) }));
        const beforeBody = (await before.json()) as { data: { groups: unknown[] } };

        const response = await call(
            new Request("http://local.test/groups/preview/presencial", {
                method: "POST",
                headers: jsonHeaders(admin.token),
                body: JSON.stringify({}),
            }),
        );
        const body = (await response.json()) as {
            data: { groups: unknown[]; availableEvaluators: { userId: string }[] };
        };

        expect(response.status).toBe(200);
        expect(body.data.groups.length).toBeGreaterThan(0);
        expect(body.data.availableEvaluators.length).toBeGreaterThan(0);

        const after = await call(new Request("http://local.test/groups", { headers: authed(admin.token) }));
        const afterBody = (await after.json()) as { data: { groups: unknown[] } };
        expect(afterBody.data.groups).toHaveLength(beforeBody.data.groups.length);
    });
});

// ============================================================
// DELETE /groups/presencial (FEAT-0021 — "Limpar organização")
// ============================================================

describe("DELETE /groups/presencial (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups/presencial", { method: "DELETE" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request("http://local.test/groups/presencial", { method: "DELETE", headers: authed(token) }),
        );
        expect(response.status).toBe(403);
    });

    it("204 remove a organização presencial", async () => {
        const admin = await userAndTokenFor("admin");
        await insertRoom();
        await insertCheckedCandidate(admin.userId);
        await call(
            new Request("http://local.test/groups/organize/presencial", {
                method: "POST",
                headers: jsonHeaders(admin.token),
                body: JSON.stringify({}),
            }),
        );

        const response = await call(
            new Request("http://local.test/groups/presencial", { method: "DELETE", headers: authed(admin.token) }),
        );

        expect(response.status).toBe(204);
        const list = await call(new Request("http://local.test/groups", { headers: authed(admin.token) }));
        const listBody = (await list.json()) as { data: { groups: { modality: string }[] } };
        expect(listBody.data.groups.every((g) => g.modality !== "presencial")).toBe(true);
    });
});

// ============================================================
// POST /groups/preview/online (FEAT-0022) — 401/403/409
// ============================================================
// O teste de NO_CANDIDATES_PRESENT precisa rodar ANTES de qualquer teste que faça check-in de
// candidato online nesta edição compartilhada (mesma disciplina de ordem documentada no topo
// do arquivo) — por isso fica aqui, antes de `organize/online` (cujos próprios testes já
// inserem candidato online). O teste de 200 (que também insere um) fica num bloco à parte,
// depois de `organize/online`, pra não competir pela mesma janela "zero candidato online".

describe("POST /groups/preview/online (HTTP) — antes de qualquer organização online", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups/preview/online", { method: "POST" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request("http://local.test/groups/preview/online", { method: "POST", headers: authed(token) }),
        );
        expect(response.status).toBe(403);
    });

    it("409 NO_CANDIDATES_PRESENT sem candidato online presente", async () => {
        const { userId, token } = await userAndTokenFor("admin");
        await insertCheckedCandidate(userId); // só presencial

        const response = await call(
            new Request("http://local.test/groups/preview/online", { method: "POST", headers: authed(token) }),
        );

        expect(response.status).toBe(409);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("NO_CANDIDATES_PRESENT");
    });
});

// ============================================================
// POST /groups/organize/online
// ============================================================

describe("POST /groups/organize/online (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups/organize/online", { method: "POST" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request("http://local.test/groups/organize/online", { method: "POST", headers: authed(token) }),
        );
        expect(response.status).toBe(403);
    });

    it("409 NO_CANDIDATES_PRESENT sem candidato online presente", async () => {
        const { userId, token } = await userAndTokenFor("admin");
        await insertCheckedCandidate(userId); // só presencial

        const response = await call(
            new Request("http://local.test/groups/organize/online", { method: "POST", headers: authed(token) }),
        );

        expect(response.status).toBe(409);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("NO_CANDIDATES_PRESENT");
    });

    it("200 organiza online sem sala/avaliador, e não apaga os grupos presenciais (US1, SC-001)", async () => {
        const { userId, token } = await userAndTokenFor("admin");
        await insertRoom();
        await insertCheckedCandidate(userId); // presencial

        const presencialResponse = await call(
            new Request("http://local.test/groups/organize/presencial", { method: "POST", headers: authed(token) }),
        );
        const presencialBody = (await presencialResponse.json()) as { data: { groups: { id: string }[] } };
        const presencialGroupIds = presencialBody.data.groups.map((g) => g.id);

        await insertCheckedCandidate(userId, { online: true });
        const onlineResponse = await call(
            new Request("http://local.test/groups/organize/online", { method: "POST", headers: authed(token) }),
        );

        expect(onlineResponse.status).toBe(200);
        const onlineBody = (await onlineResponse.json()) as {
            data: { groups: { id: string; modality: string; room: unknown; evaluators: unknown[] }[] };
        };
        expect(onlineBody.data.groups.every((g) => g.modality === "online")).toBe(true);
        expect(onlineBody.data.groups.every((g) => g.room === null)).toBe(true);
        expect(onlineBody.data.groups.every((g) => g.evaluators.length === 0)).toBe(true);

        const listResponse = await call(new Request("http://local.test/groups", { headers: authed(token) }));
        const listBody = (await listResponse.json()) as { data: { groups: { id: string }[] } };
        for (const id of presencialGroupIds) {
            expect(listBody.data.groups.some((g) => g.id === id)).toBe(true);
        }
    });
});

// ============================================================
// POST /groups/preview/online (FEAT-0022) — 200, depois que já existe organização online
// ============================================================

describe("POST /groups/preview/online (HTTP) — cálculo", () => {
    it("200 calcula a prévia sem persistir nada — GET /groups não mostra grupo online novo depois", async () => {
        const { userId, token } = await userAndTokenFor("admin");
        await insertCheckedCandidate(userId, { online: true });

        const before = await call(new Request("http://local.test/groups", { headers: authed(token) }));
        const beforeBody = (await before.json()) as { data: { groups: { id: string }[] } };
        const onlineGroupIdsBefore = new Set(beforeBody.data.groups.map((g) => g.id));

        const response = await call(
            new Request("http://local.test/groups/preview/online", { method: "POST", headers: authed(token) }),
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            data: { groups: { id: string; modality: string; room: unknown; evaluators: unknown[] }[] };
        };
        expect(body.data.groups.length).toBeGreaterThan(0);
        expect(body.data.groups.every((g) => g.modality === "online")).toBe(true);
        expect(body.data.groups.every((g) => g.room === null)).toBe(true);
        expect(body.data.groups.every((g) => g.evaluators.length === 0)).toBe(true);

        const after = await call(new Request("http://local.test/groups", { headers: authed(token) }));
        const afterBody = (await after.json()) as { data: { groups: { id: string }[] } };
        // A organização real da edição não mudou — mesmo conjunto de ids de antes da prévia (FR-013).
        expect(new Set(afterBody.data.groups.map((g) => g.id))).toEqual(onlineGroupIdsBefore);
    });
});

// ============================================================
// PATCH /groups/{groupId}/candidates/{candidateId} e .../evaluators/{userId}
// ============================================================

describe("PATCH /groups/:groupId/candidates|evaluators/:id (HTTP)", () => {
    async function organizeWithOneCandidateOneEvaluator(admin: { userId: string; token: string }) {
        await insertRoom();
        await insertCheckedCandidate(admin.userId);
        await insertCheckedCandidate(admin.userId);

        const response = await call(
            new Request("http://local.test/groups/organize/presencial", {
                method: "POST",
                headers: jsonHeaders(admin.token),
                body: JSON.stringify({}),
            }),
        );
        return (await response.json()) as { data: { groups: { id: string; candidates: { id: string }[] }[] } };
    }

    it("401 sem Authorization", async () => {
        const response = await call(
            new Request(`http://local.test/groups/${crypto.randomUUID()}/candidates/${crypto.randomUUID()}`, {
                method: "PATCH",
            }),
        );
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request(`http://local.test/groups/${crypto.randomUUID()}/candidates/${crypto.randomUUID()}`, {
                method: "PATCH",
                headers: authed(token),
            }),
        );
        expect(response.status).toBe(403);
    });

    it("404 GROUP_NOT_FOUND quando o grupo de destino não existe", async () => {
        const admin = await userAndTokenFor("admin");
        const organized = await organizeWithOneCandidateOneEvaluator(admin);
        const candidateId = organized.data.groups.flatMap((g) => g.candidates)[0]!.id;

        const response = await call(
            new Request(`http://local.test/groups/${crypto.randomUUID()}/candidates/${candidateId}`, {
                method: "PATCH",
                headers: authed(admin.token),
            }),
        );

        expect(response.status).toBe(404);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("GROUP_NOT_FOUND");
    });

    it("200 move um candidato entre os dois grupos existentes", async () => {
        const admin = await userAndTokenFor("admin");
        const organized = await organizeWithOneCandidateOneEvaluator(admin);
        const groups = organized.data.groups;
        const [groupWithCandidate] = groups.filter((g) => g.candidates.length > 0);
        const targetGroup = groups.find((g) => g.id !== groupWithCandidate!.id)!;
        const candidateId = groupWithCandidate!.candidates[0]!.id;

        const response = await call(
            new Request(`http://local.test/groups/${targetGroup.id}/candidates/${candidateId}`, {
                method: "PATCH",
                headers: authed(admin.token),
            }),
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { groups: unknown[]; warning: string | null } };
        expect(body.data.groups).toHaveLength(2);
    });
});

// ============================================================
// POST /groups/online/{groupId}/join, DELETE /groups/online/me,
// PUT /groups/online/{groupId}/evaluators/{userId} (FEAT-0018)
// ============================================================

describe("Grupos online — self-service e atribuição manual (FEAT-0018)", () => {
    async function organizeOneOnlineGroup(admin: { userId: string; token: string }) {
        await insertCheckedCandidate(admin.userId, { online: true });
        const response = await call(
            new Request("http://local.test/groups/organize/online", { method: "POST", headers: authed(admin.token) }),
        );
        const body = (await response.json()) as { data: { groups: { id: string; modality: string }[] } };
        return body.data.groups[0]!;
    }

    describe("POST /groups/online/:groupId/join", () => {
        it("401 sem Authorization", async () => {
            const response = await call(
                new Request(`http://local.test/groups/online/${crypto.randomUUID()}/join`, { method: "POST" }),
            );
            expect(response.status).toBe(401);
        });

        it("403 para admin — só avaliador pode se juntar", async () => {
            const admin = await userAndTokenFor("admin");
            const group = await organizeOneOnlineGroup(admin);

            const response = await call(
                new Request(`http://local.test/groups/online/${group.id}/join`, {
                    method: "POST",
                    headers: authed(admin.token),
                }),
            );
            expect(response.status).toBe(403);
        });

        it("200 avaliador se junta ao grupo online", async () => {
            const admin = await userAndTokenFor("admin");
            const group = await organizeOneOnlineGroup(admin);
            const avaliador = await userAndTokenFor("avaliador");

            const response = await call(
                new Request(`http://local.test/groups/online/${group.id}/join`, {
                    method: "POST",
                    headers: authed(avaliador.token),
                }),
            );

            expect(response.status).toBe(200);
            const body = (await response.json()) as { data: { evaluators: { userId: string }[] } };
            expect(body.data.evaluators.some((e) => e.userId === avaliador.userId)).toBe(true);
        });

        it("404 GROUP_NOT_FOUND para grupo inexistente", async () => {
            const avaliador = await userAndTokenFor("avaliador");

            const response = await call(
                new Request(`http://local.test/groups/online/${crypto.randomUUID()}/join`, {
                    method: "POST",
                    headers: authed(avaliador.token),
                }),
            );
            expect(response.status).toBe(404);
        });

        it("409 GROUP_MODALITY_MISMATCH ao tentar entrar num grupo presencial", async () => {
            const admin = await userAndTokenFor("admin");
            await insertRoom();
            await insertCheckedCandidate(admin.userId);
            const presencialResponse = await call(
                new Request("http://local.test/groups/organize/presencial", {
                    method: "POST",
                    headers: jsonHeaders(admin.token),
                    body: JSON.stringify({}),
                }),
            );
            const presencialBody = (await presencialResponse.json()) as { data: { groups: { id: string }[] } };
            const presencialGroupId = presencialBody.data.groups[0]!.id;
            const avaliador = await userAndTokenFor("avaliador");

            const response = await call(
                new Request(`http://local.test/groups/online/${presencialGroupId}/join`, {
                    method: "POST",
                    headers: authed(avaliador.token),
                }),
            );

            expect(response.status).toBe(409);
            const body = (await response.json()) as { error: { code: string } };
            expect(body.error.code).toBe("GROUP_MODALITY_MISMATCH");
        });
    });

    describe("DELETE /groups/online/me", () => {
        it("401 sem Authorization", async () => {
            const response = await call(new Request("http://local.test/groups/online/me", { method: "DELETE" }));
            expect(response.status).toBe(401);
        });

        it("403 para admin", async () => {
            const admin = await tokenFor("admin");
            const response = await call(
                new Request("http://local.test/groups/online/me", { method: "DELETE", headers: authed(admin) }),
            );
            expect(response.status).toBe(403);
        });

        it("404 EVALUATOR_NOT_ALLOCATED quando não está em nenhum grupo online", async () => {
            const avaliador = await tokenFor("avaliador");
            const response = await call(
                new Request("http://local.test/groups/online/me", { method: "DELETE", headers: authed(avaliador) }),
            );
            expect(response.status).toBe(404);
        });

        it("204 sai do grupo online com sucesso", async () => {
            const admin = await userAndTokenFor("admin");
            const group = await organizeOneOnlineGroup(admin);
            const avaliador = await userAndTokenFor("avaliador");
            await call(
                new Request(`http://local.test/groups/online/${group.id}/join`, {
                    method: "POST",
                    headers: authed(avaliador.token),
                }),
            );

            const response = await call(
                new Request("http://local.test/groups/online/me", { method: "DELETE", headers: authed(avaliador.token) }),
            );
            expect(response.status).toBe(204);
        });
    });

    describe("PUT /groups/online/:groupId/evaluators/:userId", () => {
        it("401 sem Authorization", async () => {
            const response = await call(
                new Request(`http://local.test/groups/online/${crypto.randomUUID()}/evaluators/${crypto.randomUUID()}`, {
                    method: "PUT",
                }),
            );
            expect(response.status).toBe(401);
        });

        it("403 para avaliador — atribuição manual é admin-only", async () => {
            const token = await tokenFor("avaliador");
            const response = await call(
                new Request(`http://local.test/groups/online/${crypto.randomUUID()}/evaluators/${crypto.randomUUID()}`, {
                    method: "PUT",
                    headers: authed(token),
                }),
            );
            expect(response.status).toBe(403);
        });

        it("200 admin atribui avaliador diretamente, sem ele precisar clicar em nada (US3)", async () => {
            const admin = await userAndTokenFor("admin");
            const group = await organizeOneOnlineGroup(admin);
            const avaliador = await userAndTokenFor("avaliador");

            const response = await call(
                new Request(`http://local.test/groups/online/${group.id}/evaluators/${avaliador.userId}`, {
                    method: "PUT",
                    headers: authed(admin.token),
                }),
            );

            expect(response.status).toBe(200);
            const body = (await response.json()) as { data: { evaluators: { userId: string }[] } };
            expect(body.data.evaluators.some((e) => e.userId === avaliador.userId)).toBe(true);
        });
    });
});

// ============================================================
// DELETE /groups/online (FEAT-0022 — "Limpar organização" no online)
// ============================================================

describe("DELETE /groups/online (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups/online", { method: "DELETE" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(new Request("http://local.test/groups/online", { method: "DELETE", headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("204 remove a organização online, sem afetar a presencial", async () => {
        const admin = await userAndTokenFor("admin");
        await insertRoom();
        await insertCheckedCandidate(admin.userId); // presencial
        const presencialResponse = await call(
            new Request("http://local.test/groups/organize/presencial", {
                method: "POST",
                headers: jsonHeaders(admin.token),
                body: JSON.stringify({}),
            }),
        );
        const presencialBody = (await presencialResponse.json()) as { data: { groups: { id: string }[] } };
        const presencialGroupId = presencialBody.data.groups[0]!.id;

        await insertCheckedCandidate(admin.userId, { online: true });
        await call(new Request("http://local.test/groups/organize/online", { method: "POST", headers: authed(admin.token) }));

        const response = await call(
            new Request("http://local.test/groups/online", { method: "DELETE", headers: authed(admin.token) }),
        );

        expect(response.status).toBe(204);
        const list = await call(new Request("http://local.test/groups", { headers: authed(admin.token) }));
        const listBody = (await list.json()) as { data: { groups: { id: string; modality: string }[] } };
        expect(listBody.data.groups.every((g) => g.modality !== "online")).toBe(true);
        expect(listBody.data.groups.some((g) => g.id === presencialGroupId)).toBe(true);
    });
});
