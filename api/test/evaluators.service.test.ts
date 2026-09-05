import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { EvaluatorsRepository } from "../src/repositories/evaluators.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { EvaluatorsService } from "../src/services/evaluators.service";

// D1 real via miniflare (isolatedStorage por teste — cada `it` começa do
// banco recém-migrado, com os processos seletivos 2026.1/2026.2 semeados,
// mesmo fixture que checkin.service.test.ts usa).

let counter = 0;

function service(): EvaluatorsService {
    return new EvaluatorsService(new EvaluatorsRepository(env.DB), new SelectionProcessRepository(env.DB));
}

type EvaluatorOverrides = { status?: "active" | "post_junior" | "trainee"; role?: "admin" | "avaliador"; deactivated?: boolean };

async function insertEvaluator(overrides: EvaluatorOverrides = {}) {
    counter += 1;
    const userId = crypto.randomUUID();
    const status = overrides.status ?? "active";
    const role = overrides.role ?? "avaliador";

    await env.DB.prepare(
        `INSERT INTO users (id, role_id, email, name, deactivated_at) VALUES (?, ?, ?, ?, ?)`,
    )
        .bind(userId, role, `avaliador-${counter}@example.com`, `Avaliador ${counter}`, overrides.deactivated ? "2026-01-01 00:00:00" : null)
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
            `Avaliador ${counter}`,
            `+5571999${String(counter).padStart(6, "0")}`,
            "eng-computacao",
            5,
            "outro",
            "nao-informado",
            status,
            "2026-08-01 00:00:00",
        )
        .run();

    return userId;
}

async function insertSecondProcess(): Promise<string> {
    const id = crypto.randomUUID();
    await env.DB.prepare(
        `INSERT INTO selection_processes (id, label, starts_at, ends_at) VALUES (?, ?, ?, ?)`,
    )
        .bind(id, `Edição extra ${crypto.randomUUID()}`, "2025-01-01 00:00:00", "2025-06-30 23:59:59")
        .run();
    return id;
}

// Data dentro da janela 2026.2 semeada pelo fixture (mesma usada em checkin.service.test.ts).
const NOW = new Date("2026-08-05T12:00:00Z");

describe("EvaluatorsService", () => {
    beforeEach(() => {
        counter += 0; // no-op — mantém o contador entre `it`s do arquivo (mesmo padrão de checkin.service.test.ts)
    });

    describe("list", () => {
        it("FR-004 - avaliador sem atribuição aparece como avaliador por padrão, com memberStatus (FR-002)", async () => {
            const userId = await insertEvaluator({ status: "trainee" });

            const result = await service().list("all", NOW);

            expect(result.isRight()).toBe(true);
            if (result.isRight()) {
                const entry = result.value.find((e) => e.userId === userId);
                expect(entry?.role).toBe("avaliador");
                expect(entry?.memberStatus).toBe("trainee");
            }
        });

        it("após setRole(host), a pessoa aparece como host na listagem", async () => {
            const userId = await insertEvaluator();
            await service().setRole(userId, "host", NOW);

            const result = await service().list("all", NOW);

            expect(result.isRight()).toBe(true);
            if (result.isRight()) {
                expect(result.value.find((e) => e.userId === userId)?.role).toBe("host");
            }
        });

        it("R5 - contas desativadas não aparecem na listagem", async () => {
            const userId = await insertEvaluator({ deactivated: true });

            const result = await service().list("all", NOW);

            expect(result.isRight()).toBe(true);
            if (result.isRight()) {
                expect(result.value.some((e) => e.userId === userId)).toBe(false);
            }
        });
    });

    describe("list - filtro por cargo (US2)", () => {
        it("role=host devolve só quem é host; role=avaliador só quem não é; role=all devolve todos", async () => {
            const hostId = await insertEvaluator();
            const evaluatorId = await insertEvaluator();
            await service().setRole(hostId, "host", NOW);

            const hosts = await service().list("host", NOW);
            const avaliadores = await service().list("avaliador", NOW);
            const all = await service().list("all", NOW);

            expect(hosts.isRight() && hosts.value.map((e) => e.userId)).toContain(hostId);
            expect(hosts.isRight() && hosts.value.map((e) => e.userId)).not.toContain(evaluatorId);
            expect(avaliadores.isRight() && avaliadores.value.map((e) => e.userId)).toContain(evaluatorId);
            expect(avaliadores.isRight() && avaliadores.value.map((e) => e.userId)).not.toContain(hostId);
            expect(all.isRight() && all.value.map((e) => e.userId)).toEqual(
                expect.arrayContaining([hostId, evaluatorId]),
            );
        });
    });

    describe("setRole", () => {
        it("é idempotente marcando host quem já é host", async () => {
            const userId = await insertEvaluator();
            await service().setRole(userId, "host", NOW);

            const second = await service().setRole(userId, "host", NOW);

            expect(second.isRight()).toBe(true);
            if (second.isRight()) expect(second.value.role).toBe("host");
        });

        it("é idempotente marcando avaliador quem já é avaliador", async () => {
            const userId = await insertEvaluator();

            const result = await service().setRole(userId, "avaliador", NOW);

            expect(result.isRight()).toBe(true);
            if (result.isRight()) expect(result.value.role).toBe("avaliador");
        });

        it("FR-005 - alternar na edição corrente não altera o cargo gravado numa edição diferente", async () => {
            const userId = await insertEvaluator();
            const otherProcessId = await insertSecondProcess();

            await env.DB.prepare(`INSERT INTO edition_hosts (id, process_id, user_id) VALUES (?, ?, ?)`)
                .bind(crypto.randomUUID(), otherProcessId, userId)
                .run();

            await service().setRole(userId, "host", NOW);
            await service().setRole(userId, "avaliador", NOW);

            const stillHostElsewhere = await env.DB.prepare(
                "SELECT COUNT(*) AS n FROM edition_hosts WHERE process_id = ? AND user_id = ?",
            )
                .bind(otherProcessId, userId)
                .first<{ n: number }>();
            expect(stillHostElsewhere?.n).toBe(1);
        });
    });
});
