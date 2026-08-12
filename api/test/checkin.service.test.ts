import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { CandidateRepository } from "../src/repositories/candidates.repository";
import { CheckinRepository } from "../src/repositories/checkin.repository";
import { CheckinService } from "../src/services/checkin.service";

// D1 real via miniflare (isolatedStorage por teste — cada `it` começa do
// banco recém-migrado, com os dois processos seletivos semeados).

let counter = 0;

function service(): CheckinService {
    return new CheckinService(new CandidateRepository(env.DB), new CheckinRepository(env.DB));
}

async function insertCandidate(overrides: { name?: string; createdAt?: string } = {}) {
    counter += 1;
    const row = {
        id: crypto.randomUUID(),
        name: overrides.name ?? `Candidato Svc ${counter}`,
        email: `candidato-svc-${counter}@example.com`,
        phone: `71988880${String(counter).padStart(3, "0")}`,
        course: "eng-computacao",
        semester: 3,
        gender: "outro",
        ethnicity: "nao-informado",
        // Dentro da janela 2026.2 por padrão (2026-08-01 a 2026-12-31).
        created_at: overrides.createdAt ?? "2026-08-05 12:00:00",
    };

    await env.DB.prepare(
        `INSERT INTO candidates (id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(row.id, row.course, row.semester, row.gender, row.ethnicity, row.name, row.email, row.phone, row.created_at)
        .run();

    return row;
}

async function insertUser(role: "avaliador" | "admin" = "avaliador") {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare(`INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)`)
        .bind(id, role, `user-svc-${counter}@example.com`, `Avaliador ${counter}`)
        .run();

    return id;
}

async function countEvents(candidateId: string, action?: string): Promise<number> {
    const sql = action
        ? "SELECT COUNT(*) AS n FROM checkin_events WHERE candidate_id = ? AND action = ?"
        : "SELECT COUNT(*) AS n FROM checkin_events WHERE candidate_id = ?";
    const stmt = action ? env.DB.prepare(sql).bind(candidateId, action) : env.DB.prepare(sql).bind(candidateId);
    const row = await stmt.first<{ n: number }>();
    return row?.n ?? 0;
}

/** 2026-08-10, dentro da janela `2026.2`. */
const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("CheckinService.listCandidates — resolução do processo (FEAT-0005, seção 4.1.1)", () => {
    it("reaproveita a linha semeada pela migration (0006) sem duplicar", async () => {
        const svc = service();
        const repo = new CheckinRepository(env.DB);

        // A migration já semeia `2026.1`/`2026.2` (cobre 2026.1, que a
        // criação sob demanda nunca geraria por olhar só para "hoje").
        const seeded = await repo.findProcessByLabel("2026.2");
        expect(seeded).not.toBeNull();

        const first = await svc.listCandidates({ page: 1, per_page: 25, status: "todos" }, NOW);
        expect(first.isRight()).toBe(true);
        if (!first.isRight()) return;
        expect(first.value.process.label).toBe("2026.2");
        expect(first.value.process.id).toBe(seeded?.id);

        await svc.listCandidates({ page: 1, per_page: 25, status: "todos" }, NOW);

        const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM selection_processes WHERE label = ?")
            .bind("2026.2")
            .all<{ n: number }>();
        expect(results?.[0]?.n).toBe(1);
    });

    it("cria a edição sob demanda quando a data cai fora das duas linhas semeadas", async () => {
        const svc = service();
        const repo = new CheckinRepository(env.DB);
        const futureDate = new Date("2027-03-15T12:00:00.000Z"); // 2027.1 — não semeado

        expect(await repo.findProcessByLabel("2027.1")).toBeNull();

        const result = await svc.listCandidates({ page: 1, per_page: 25, status: "todos" }, futureDate);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) expect(result.value.process.label).toBe("2027.1");
        expect(await repo.findProcessByLabel("2027.1")).not.toBeNull();
    });
});

describe("CheckinService.markPresent / unmarkPresent", () => {
    it("E1 - candidato inexistente retorna CandidateNotFoundError", async () => {
        const svc = service();
        const actorId = await insertUser();

        const result = await svc.markPresent(crypto.randomUUID(), actorId, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("CANDIDATE_NOT_FOUND");
    });

    it("E3 - candidato de outra edição não pode ser marcado presente", async () => {
        const svc = service();
        const actorId = await insertUser();
        // created_at em fevereiro/2026 -> pertence a `2026.1`, não a `2026.2` (NOW).
        const candidate = await insertCandidate({ createdAt: "2026-02-10 09:00:00" });

        const result = await svc.markPresent(candidate.id, actorId, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("CANDIDATE_NOT_IN_ACTIVE_PROCESS");
    });

    it("fluxo feliz: marca presença e grava um evento 'marcou'", async () => {
        const svc = service();
        const actorId = await insertUser();
        const candidate = await insertCandidate();

        const result = await svc.markPresent(candidate.id, actorId, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.candidateId).toBe(candidate.id);
            expect(result.value.checkedInAt).toBeTruthy();
        }
        expect(await countEvents(candidate.id, "marcou")).toBe(1);
    });

    it("E4 - marcar presença já confirmada não é erro, não duplica evento, e preserva o checkedInAt original", async () => {
        const svc = service();
        const actorId = await insertUser();
        const candidate = await insertCandidate();

        const first = await svc.markPresent(candidate.id, actorId, NOW);
        // Espera um instante para garantir que um `checked_in_at` novo, se
        // gerado por engano, teria timestamp diferente do original.
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const second = await svc.markPresent(candidate.id, actorId, NOW);

        expect(first.isRight() && second.isRight()).toBe(true);
        if (first.isRight() && second.isRight()) {
            expect(second.value.checkedInAt).toBe(first.value.checkedInAt);
        }
        expect(await countEvents(candidate.id, "marcou")).toBe(1);
    });

    it("E5 - desmarcar presença inexistente não é erro e não grava evento", async () => {
        const svc = service();
        const actorId = await insertUser();
        const candidate = await insertCandidate();

        const result = await svc.unmarkPresent(candidate.id, actorId, NOW);

        expect(result.isRight()).toBe(true);
        expect(await countEvents(candidate.id)).toBe(0);
    });

    it("marcar e desmarcar: candidate_checkins fica vazio (DELETE puro) e o log tem as duas ações, na ordem, com o ator certo", async () => {
        const svc = service();
        const actorId = await insertUser();
        const candidate = await insertCandidate();
        const repo = new CheckinRepository(env.DB);

        await svc.markPresent(candidate.id, actorId, NOW);
        const unmarkResult = await svc.unmarkPresent(candidate.id, actorId, NOW);
        expect(unmarkResult.isRight()).toBe(true);

        const process = await repo.findProcessByLabel("2026.2");
        expect(await repo.findCheckin(candidate.id, process!.id)).toBeNull();

        const { results } = await env.DB.prepare(
            "SELECT action, actor_id FROM checkin_events WHERE candidate_id = ? ORDER BY created_at ASC",
        )
            .bind(candidate.id)
            .all<{ action: string; actor_id: string }>();

        expect(results?.map((row) => row.action)).toEqual(["marcou", "desmarcou"]);
        expect(results?.every((row) => row.actor_id === actorId)).toBe(true);
    });

    it("candidatos com o mesmo par (candidato, processo) marcados por avaliadores diferentes: quem chegou primeiro fica registrado", async () => {
        const svc = service();
        const firstActor = await insertUser();
        const secondActor = await insertUser();
        const candidate = await insertCandidate();

        const first = await svc.markPresent(candidate.id, firstActor, NOW);
        const second = await svc.markPresent(candidate.id, secondActor, NOW);

        expect(first.isRight() && second.isRight()).toBe(true);

        const repo = new CheckinRepository(env.DB);
        const process = await repo.findProcessByLabel("2026.2");
        const row = await repo.findCheckin(candidate.id, process!.id);

        expect(row?.checked_in_by).toBe(firstActor);
    });
});

describe("CheckinService.listCandidates — busca, filtro e paginação", () => {
    it("busca, status e paginação são resolvidos juntos; `total` reflete o conjunto filtrado", async () => {
        const svc = service();
        const actorId = await insertUser();

        const alice = await insertCandidate({ name: "Alice Filtro Presente" });
        const bruno = await insertCandidate({ name: "Bruno Filtro Ausente" });
        const carla = await insertCandidate({ name: "Carla Filtro Presente" });

        await svc.markPresent(alice.id, actorId, NOW);
        await svc.markPresent(carla.id, actorId, NOW);

        const presentes = await svc.listCandidates(
            { page: 1, per_page: 25, status: "presentes", search: "Filtro" },
            NOW,
        );
        expect(presentes.isRight()).toBe(true);
        if (presentes.isRight()) {
            expect(presentes.value.pagination.total).toBe(2);
            expect(presentes.value.items.map((item) => item.name).sort()).toEqual([
                "Alice Filtro Presente",
                "Carla Filtro Presente",
            ]);
            // Nunca inclui dado sensível de inscrição (FEAT-0005, seção 8.3).
            for (const item of presentes.value.items) {
                expect(item).not.toHaveProperty("gender");
                expect(item).not.toHaveProperty("ethnicity");
            }
        }

        const buscaBruno = await svc.listCandidates(
            { page: 1, per_page: 25, status: "todos", search: "Bruno Filtro" },
            NOW,
        );
        expect(buscaBruno.isRight()).toBe(true);
        if (buscaBruno.isRight()) {
            expect(buscaBruno.value.items).toHaveLength(1);
            expect(buscaBruno.value.items[0]?.name).toBe(bruno.name);
            expect(buscaBruno.value.items[0]?.checkedInAt).toBeNull();
        }
    });

    it("paginação: perPage limita os itens da página, mas totalPages reflete o total real", async () => {
        const svc = service();
        for (let i = 0; i < 3; i += 1) {
            await insertCandidate({ name: `Paginação ${i} ${crypto.randomUUID()}` });
        }

        const page1 = await svc.listCandidates({ page: 1, per_page: 2, status: "todos", search: "Paginação" }, NOW);
        expect(page1.isRight()).toBe(true);
        if (page1.isRight()) {
            expect(page1.value.items).toHaveLength(2);
            expect(page1.value.pagination.total).toBe(3);
            expect(page1.value.pagination.totalPages).toBe(2);
        }

        const page2 = await svc.listCandidates({ page: 2, per_page: 2, status: "todos", search: "Paginação" }, NOW);
        if (page2.isRight()) {
            expect(page2.value.items).toHaveLength(1);
        }
    });

    it("candidato fora da janela do processo corrente não aparece na listagem", async () => {
        const svc = service();
        await insertCandidate({ name: "Fora Da Janela Único", createdAt: "2026-03-01 10:00:00" });

        const result = await svc.listCandidates({ page: 1, per_page: 25, status: "todos", search: "Fora Da Janela" }, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.items).toHaveLength(0);
        }
    });
});
