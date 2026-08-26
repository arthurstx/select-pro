import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { MemberCheckinRepository } from "../src/repositories/member-checkin.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { MemberCheckinService } from "../src/services/member-checkin.service";

// D1 real via miniflare — mesmo fixture (2026.1/2026.2 semeados) que
// checkin.service.test.ts e evaluators.service.test.ts usam.

let counter = 0;

function service(): MemberCheckinService {
    return new MemberCheckinService(new MemberCheckinRepository(env.DB), new SelectionProcessRepository(env.DB));
}

/** Espelha `insertEvaluator` de evaluators.service.test.ts — mesmo par `users`/`member_profiles`. */
async function insertEvaluator(overrides: { deactivated?: boolean } = {}) {
    counter += 1;
    const userId = crypto.randomUUID();

    await env.DB.prepare(`INSERT INTO users (id, role_id, email, name, deactivated_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(
            userId,
            "avaliador",
            `avaliador-mc-${counter}@example.com`,
            `Avaliador MC ${counter}`,
            overrides.deactivated ? "2026-01-01 00:00:00" : null,
        )
        .run();

    await env.DB.prepare(
        `INSERT INTO member_profiles
                (id, user_id, member_id, full_name, phone, course, semester, gender, ethnicity, status, manager, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
        .bind(
            crypto.randomUUID(),
            userId,
            crypto.randomUUID(),
            `Avaliador MC ${counter}`,
            `+5571998${String(counter).padStart(6, "0")}`,
            "eng-computacao",
            5,
            "outro",
            "nao-informado",
            "active",
            "2026-08-01 00:00:00",
        )
        .run();

    return userId;
}

async function markHost(processId: string, userId: string) {
    await env.DB.prepare(`INSERT INTO edition_hosts (id, process_id, user_id) VALUES (?, ?, ?)`)
        .bind(crypto.randomUUID(), processId, userId)
        .run();
}

async function insertAdmin() {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)`)
        .bind(id, "admin", `admin-mc-${counter}@example.com`, `Admin ${counter}`)
        .run();
    return id;
}

async function countEvents(userId: string, action?: string): Promise<number> {
    const sql = action
        ? "SELECT COUNT(*) AS n FROM member_checkin_events WHERE user_id = ? AND action = ?"
        : "SELECT COUNT(*) AS n FROM member_checkin_events WHERE user_id = ?";
    const stmt = action ? env.DB.prepare(sql).bind(userId, action) : env.DB.prepare(sql).bind(userId);
    const row = await stmt.first<{ n: number }>();
    return row?.n ?? 0;
}

/** 2026-08-10, dentro da janela `2026.2`. */
const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("MemberCheckinService.list", () => {
    // NOTA: `isolatedStorage` do vitest-pool-workers isola por ARQUIVO de
    // teste, não por `it` — o D1 acumula entre os testes deste describe (o
    // mesmo motivo pelo qual checkin.service.test.ts filtra por `search`
    // com marcador único em vez de contar o total). Como `list()` não tem
    // filtro (US1 não pagina), os testes abaixo evitam contagem absoluta,
    // exceto este primeiro — que por isso precisa continuar sendo o
    // primeiro `it` do arquivo a tocar `member_profiles`.
    it("FR-009 — edição corrente sem nenhum avaliador/host atribuído responde NO_EVALUATORS_IN_EDITION", async () => {
        const svc = service();

        const result = await svc.list(NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("NO_EVALUATORS_IN_EDITION");
    });

    it("FR-001/FR-006 — lista avaliadores e hosts com cargo e resumo de presença", async () => {
        const svc = service();
        const processes = new SelectionProcessRepository(env.DB);
        const process = await processes.resolveCurrent(NOW);

        // Baseline capturado ANTES de inserir os novos avaliadores — a
        // primeira leitura da linha 109 já incluiria os dois se viesse
        // depois (ver nota de acumulação no topo do describe).
        const before = await svc.list(NOW);
        const totalBefore = before.isRight() ? before.value.summary.total : 0;
        const checkedInBefore = before.isRight() ? before.value.summary.checkedIn : 0;

        const avaliador = await insertEvaluator();
        const host = await insertEvaluator();
        await markHost(process.id, host);
        const actorId = await insertAdmin();

        await svc.markPresent(avaliador, actorId, NOW);

        const result = await svc.list(NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            // Delta em vez de total absoluto — `member_profiles` acumula entre `it`s deste arquivo (ver nota acima).
            expect(result.value.items.length).toBe(totalBefore + 2);
            expect(result.value.summary).toEqual({ total: totalBefore + 2, checkedIn: checkedInBefore + 1 });

            const hostItem = result.value.items.find((item) => item.userId === host);
            expect(hostItem?.role).toBe("host");
            expect(hostItem?.checkedInAt).toBeNull();

            const avaliadorItem = result.value.items.find((item) => item.userId === avaliador);
            expect(avaliadorItem?.role).toBe("avaliador");
            expect(avaliadorItem?.checkedInAt).toBeTruthy();
        }
    });

    it("avaliador desativado não aparece na lista (mesmo filtro de EvaluatorsRepository)", async () => {
        const svc = service();
        const deactivatedId = await insertEvaluator({ deactivated: true });
        const activeId = await insertEvaluator();

        const result = await svc.list(NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.items.some((item) => item.userId === deactivatedId)).toBe(false);
            expect(result.value.items.some((item) => item.userId === activeId)).toBe(true);
        }
    });
});

describe("MemberCheckinService.markPresent / unmarkPresent", () => {
    it("`userId` que não é avaliador/host elegível responde EVALUATOR_NOT_FOUND", async () => {
        const svc = service();
        const actorId = await insertAdmin();

        const result = await svc.markPresent(crypto.randomUUID(), actorId, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("EVALUATOR_NOT_FOUND");
    });

    it("fluxo feliz: marca presença e grava um evento 'marcou'", async () => {
        const svc = service();
        const actorId = await insertAdmin();
        const userId = await insertEvaluator();

        const result = await svc.markPresent(userId, actorId, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.userId).toBe(userId);
            expect(result.value.checkedInAt).toBeTruthy();
        }
        expect(await countEvents(userId, "marcou")).toBe(1);
    });

    it("marcar presença já confirmada não é erro, não duplica evento, e preserva o checkedInAt original", async () => {
        const svc = service();
        const actorId = await insertAdmin();
        const userId = await insertEvaluator();

        const first = await svc.markPresent(userId, actorId, NOW);
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const second = await svc.markPresent(userId, actorId, NOW);

        expect(first.isRight() && second.isRight()).toBe(true);
        if (first.isRight() && second.isRight()) {
            expect(second.value.checkedInAt).toBe(first.value.checkedInAt);
        }
        expect(await countEvents(userId, "marcou")).toBe(1);
    });

    it("desmarcar presença inexistente não é erro e não grava evento", async () => {
        const svc = service();
        const actorId = await insertAdmin();
        const userId = await insertEvaluator();

        const result = await svc.unmarkPresent(userId, actorId, NOW);

        expect(result.isRight()).toBe(true);
        expect(await countEvents(userId)).toBe(0);
    });

    it("marcar e desmarcar: member_checkins fica vazio (DELETE puro) e o log tem as duas ações, na ordem, com o ator certo", async () => {
        const svc = service();
        const actorId = await insertAdmin();
        const userId = await insertEvaluator();
        const processes = new SelectionProcessRepository(env.DB);
        const repo = new MemberCheckinRepository(env.DB);

        await svc.markPresent(userId, actorId, NOW);
        const unmarkResult = await svc.unmarkPresent(userId, actorId, NOW);
        expect(unmarkResult.isRight()).toBe(true);

        const process = await processes.resolveCurrent(NOW);
        expect(await repo.findCheckin(userId, process.id)).toBeNull();

        const { results } = await env.DB.prepare(
            "SELECT action, actor_id FROM member_checkin_events WHERE user_id = ? ORDER BY created_at ASC",
        )
            .bind(userId)
            .all<{ action: string; actor_id: string }>();

        expect(results?.map((row) => row.action)).toEqual(["marcou", "desmarcou"]);
        expect(results?.every((row) => row.actor_id === actorId)).toBe(true);
    });

    it("check-in de uma edição não interfere no de outra (mesma pessoa em duas edições)", async () => {
        const svc = service();
        const actorId = await insertAdmin();
        const userId = await insertEvaluator();

        const otherProcessId = crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO selection_processes (id, label, starts_at, ends_at) VALUES (?, ?, ?, ?)`)
            .bind(otherProcessId, `Edição extra ${crypto.randomUUID()}`, "2025-01-01 00:00:00", "2025-06-30 23:59:59")
            .run();

        const repo = new MemberCheckinRepository(env.DB);
        await repo.upsertCheckin({ userId, processId: otherProcessId, checkedInBy: actorId });

        const result = await svc.markPresent(userId, actorId, NOW);
        expect(result.isRight()).toBe(true);

        const currentProcess = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        expect(await repo.findCheckin(userId, otherProcessId)).not.toBeNull();
        expect(await repo.findCheckin(userId, currentProcess.id)).not.toBeNull();
    });
});
