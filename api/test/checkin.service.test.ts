import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { CheckinListCache } from "../src/lib/checkin-list-cache";
import { CandidateRepository } from "../src/repositories/candidates.repository";
import { CheckinRepository } from "../src/repositories/checkin.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { CheckinService } from "../src/services/checkin.service";

// D1 real via miniflare (isolatedStorage por teste — cada `it` começa do
// banco recém-migrado, com os dois processos seletivos semeados). KV também
// é real (miniflare), via `env.CANDIDATES_KV`.

let counter = 0;

/** Sem cache — a maioria dos testes quer ler o D1 direto, sem se preocupar com TTL/geração. */
function service(): CheckinService {
    return new CheckinService(new CandidateRepository(env.DB), new CheckinRepository(env.DB), new SelectionProcessRepository(env.DB));
}

/** Com cache — só para os testes desta seção, que existem para provar que ele funciona. */
function serviceWithCache(): CheckinService {
    return new CheckinService(
        new CandidateRepository(env.DB),
        new CheckinRepository(env.DB),
        new SelectionProcessRepository(env.DB),
        new CheckinListCache(env.CANDIDATES_KV),
    );
}

async function insertCandidate(overrides: { name?: string; createdAt?: string; course?: string } = {}) {
    counter += 1;
    const row = {
        id: crypto.randomUUID(),
        name: overrides.name ?? `Candidato Svc ${counter}`,
        email: `candidato-svc-${counter}@example.com`,
        phone: `+557198888${String(counter).padStart(4, "0")}`,
        course: overrides.course ?? "eng-computacao",
        semester: 3,
        gender: "outro",
        ethnicity: "nao-informado",
        // Dentro da janela 2026.2 por padrão (2026-08-01 a 2026-12-31).
        created_at: overrides.createdAt ?? "2026-08-05 12:00:00",
    };

    // `process_id` derivado da janela do próprio `created_at` — mesma regra
    // da migration 0007, para o fixture refletir o que a inscrição grava.
    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, (SELECT id FROM selection_processes WHERE ? BETWEEN starts_at AND ends_at), ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(row.id, row.created_at, row.course, row.semester, row.gender, row.ethnicity, row.name, row.email, row.phone, row.created_at)
        .run();

    return row;
}

/**
 * FEAT-0010, US3. `insertCandidate` sozinho não cria `candidate_applications`
 * — a query de listagem trata a ausência via `COALESCE(..., 0)` (não-online
 * por padrão), então só candidatos que precisam ser "online" nos testes
 * passam por aqui.
 */
async function insertApplication(candidateId: string, saturdayRestriction: boolean) {
    await env.DB.prepare(
        `INSERT INTO candidate_applications
                (id, candidate_id, referral_source, mej_acknowledged, experience, motivation, saturday_restriction, special_needs)
              VALUES (?, ?, 'indicacao', 1, 'Nenhuma', 'Motivação', ?, 0)`,
    )
        .bind(crypto.randomUUID(), candidateId, saturdayRestriction ? 1 : 0)
        .run();
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
        const repo = new SelectionProcessRepository(env.DB);

        // A migration já semeia `2026.1`/`2026.2` (cobre 2026.1, que a
        // criação sob demanda nunca geraria por olhar só para "hoje").
        const seeded = await repo.findByLabel("2026.2");
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
        const repo = new SelectionProcessRepository(env.DB);
        const futureDate = new Date("2027-03-15T12:00:00.000Z"); // 2027.1 — não semeado

        expect(await repo.findByLabel("2027.1")).toBeNull();

        const result = await svc.listCandidates({ page: 1, per_page: 25, status: "todos" }, futureDate);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) expect(result.value.process.label).toBe("2027.1");
        expect(await repo.findByLabel("2027.1")).not.toBeNull();
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
        const processes = new SelectionProcessRepository(env.DB);
        const checkins = new CheckinRepository(env.DB);

        await svc.markPresent(candidate.id, actorId, NOW);
        const unmarkResult = await svc.unmarkPresent(candidate.id, actorId, NOW);
        expect(unmarkResult.isRight()).toBe(true);

        const process = await processes.findByLabel("2026.2");
        expect(await checkins.findCheckin(candidate.id, process!.id)).toBeNull();

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

        const process = await new SelectionProcessRepository(env.DB).findByLabel("2026.2");
        const row = await new CheckinRepository(env.DB).findCheckin(candidate.id, process!.id);

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

    it("totalCandidates (contador 'X de Y presentes' do cabeçalho) nunca muda com a aba de status, só com busca/curso", async () => {
        const svc = service();
        const actorId = await insertUser();
        const marca = crypto.randomUUID();

        const alice = await insertCandidate({ name: `Contador ${marca} Um` });
        const bruno = await insertCandidate({ name: `Contador ${marca} Dois` });
        await insertCandidate({ name: `Contador ${marca} Tres` });

        await svc.markPresent(alice.id, actorId, NOW);
        await svc.markPresent(bruno.id, actorId, NOW);

        for (const status of ["todos", "presentes", "ausentes"] as const) {
            const result = await svc.listCandidates({ page: 1, per_page: 25, status, search: marca }, NOW);
            expect(result.isRight()).toBe(true);
            if (result.isRight()) {
                // 3 candidatos no total, independente de qual aba está selecionada.
                expect(result.value.totalCandidates).toBe(3);
            }
        }

        // "X" (presentes) é sempre a soma do attendanceSummary, coerente com totalCandidates = 3.
        const todos = await svc.listCandidates({ page: 1, per_page: 25, status: "todos", search: marca }, NOW);
        if (todos.isRight()) {
            expect(todos.value.attendanceSummary.online + todos.value.attendanceSummary.presencial).toBe(2);
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

    // FEAT-0015 — filtro por curso.
    it("filtro por curso: retorna só candidatos do curso pedido", async () => {
        const svc = service();
        const marca = crypto.randomUUID();
        await insertCandidate({ name: `Curso Comp ${marca}`, course: "eng-computacao" });
        await insertCandidate({ name: `Curso Civil ${marca}`, course: "eng-civil" });

        const result = await svc.listCandidates(
            { page: 1, per_page: 25, status: "todos", search: marca, course: "eng-computacao" },
            NOW,
        );

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.items).toHaveLength(1);
            expect(result.value.items[0]?.course).toBe("eng-computacao");
        }
    });

    it("filtro por curso combina por E lógico com status e busca", async () => {
        const svc = service();
        const actorId = await insertUser();
        const marca = crypto.randomUUID();
        const presenteComp = await insertCandidate({ name: `Combo Presente Comp ${marca}`, course: "eng-computacao" });
        await insertCandidate({ name: `Combo Ausente Comp ${marca}`, course: "eng-computacao" });
        await insertCandidate({ name: `Combo Presente Civil ${marca}`, course: "eng-civil" });
        await svc.markPresent(presenteComp.id, actorId, NOW);

        const result = await svc.listCandidates(
            { page: 1, per_page: 25, status: "presentes", search: marca, course: "eng-computacao" },
            NOW,
        );

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.pagination.total).toBe(1);
            expect(result.value.items[0]?.name).toBe(presenteComp.name);
        }
    });

    it("sem `course` no filtro, o comportamento é idêntico ao atual (todos os cursos)", async () => {
        const svc = service();
        const marca = crypto.randomUUID();
        await insertCandidate({ name: `Sem Filtro Comp ${marca}`, course: "eng-computacao" });
        await insertCandidate({ name: `Sem Filtro Civil ${marca}`, course: "eng-civil" });

        const result = await svc.listCandidates({ page: 1, per_page: 25, status: "todos", search: marca }, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.items).toHaveLength(2);
        }
    });
});

describe("CheckinService.listCandidates — cache em KV inclui `course` na chave (FEAT-0015)", () => {
    it("filtrar por cursos diferentes não reaproveita o cache do outro curso", async () => {
        const svc = serviceWithCache();
        const marca = crypto.randomUUID();
        await insertCandidate({ name: `Cache Curso Comp ${marca}`, course: "eng-computacao" });
        await insertCandidate({ name: `Cache Curso Civil ${marca}`, course: "eng-civil" });

        const comp = await svc.listCandidates(
            { page: 1, per_page: 25, status: "todos", search: marca, course: "eng-computacao" },
            NOW,
        );
        const civil = await svc.listCandidates(
            { page: 1, per_page: 25, status: "todos", search: marca, course: "eng-civil" },
            NOW,
        );

        expect(comp.isRight() && civil.isRight()).toBe(true);
        if (comp.isRight() && civil.isRight()) {
            expect(comp.value.items).toHaveLength(1);
            expect(comp.value.items[0]?.course).toBe("eng-computacao");
            expect(civil.value.items).toHaveLength(1);
            expect(civil.value.items[0]?.course).toBe("eng-civil");
        }
    });
});

describe("CheckinService.listCandidates — cache em KV", () => {
    it("a segunda leitura idêntica vem do cache: um candidato inserido direto no D1 não aparece até o cache invalidar", async () => {
        const svc = serviceWithCache();
        const query = { page: 1, per_page: 25, status: "todos" as const, search: "Cache Kv Unico" };

        const first = await svc.listCandidates(query, NOW);
        expect(first.isRight()).toBe(true);
        if (first.isRight()) expect(first.value.items).toHaveLength(0);

        // Inserção direta no D1, por fora do service — nada chama invalidate().
        await insertCandidate({ name: "Cache Kv Unico Fantasma" });

        const second = await svc.listCandidates(query, NOW);
        expect(second.isRight()).toBe(true);
        if (second.isRight()) {
            // Prova que a segunda leitura veio do cache, não do D1: se tivesse
            // ido ao banco, o candidato inserido acima apareceria.
            expect(second.value.items).toHaveLength(0);
        }
    });

    it("marcar presença invalida o cache — a próxima listagem reflete a mudança na hora, não depois do TTL", async () => {
        const svc = serviceWithCache();
        const actorId = await insertUser();
        const candidate = await insertCandidate({ name: "Cache Invalida Unico" });
        const query = { page: 1, per_page: 25, status: "todos" as const, search: "Cache Invalida Unico" };

        const before = await svc.listCandidates(query, NOW);
        expect(before.isRight()).toBe(true);
        if (before.isRight()) expect(before.value.items[0]?.checkedInAt).toBeNull();

        const markResult = await svc.markPresent(candidate.id, actorId, NOW);
        expect(markResult.isRight()).toBe(true);

        const after = await svc.listCandidates(query, NOW);
        expect(after.isRight()).toBe(true);
        if (after.isRight()) {
            // Mesma consulta, mesmo cache — mas checkedInAt não pode ser o
            // valor cacheado ANTES de marcar. Se aparecer null aqui, a
            // invalidação por geração não está funcionando.
            expect(after.value.items[0]?.checkedInAt).not.toBeNull();
        }
    });

    it("desmarcar presença também invalida o cache", async () => {
        const svc = serviceWithCache();
        const actorId = await insertUser();
        const candidate = await insertCandidate({ name: "Cache Desmarca Unico" });
        const query = { page: 1, per_page: 25, status: "todos" as const, search: "Cache Desmarca Unico" };

        await svc.markPresent(candidate.id, actorId, NOW);
        const beforeUnmark = await svc.listCandidates(query, NOW);
        if (beforeUnmark.isRight()) expect(beforeUnmark.value.items[0]?.checkedInAt).not.toBeNull();

        const unmarkResult = await svc.unmarkPresent(candidate.id, actorId, NOW);
        expect(unmarkResult.isRight()).toBe(true);

        const afterUnmark = await svc.listCandidates(query, NOW);
        if (afterUnmark.isRight()) expect(afterUnmark.value.items[0]?.checkedInAt).toBeNull();
    });
});

describe("CheckinService.listCandidates — sinalização online/presencial (FEAT-0010, US3/D7)", () => {
    it("candidato com saturday_restriction presente aparece como 'online'; sem restrição, como 'presencial'; ausente, `null`", async () => {
        const svc = service();
        const actorId = await insertUser();
        const marca = crypto.randomUUID();

        const online = await insertCandidate({ name: `Attendance Online ${marca}` });
        await insertApplication(online.id, true);
        const presencial = await insertCandidate({ name: `Attendance Presencial ${marca}` });
        await insertApplication(presencial.id, false);
        const ausente = await insertCandidate({ name: `Attendance Ausente ${marca}` });
        await insertApplication(ausente.id, true);

        await svc.markPresent(online.id, actorId, NOW);
        await svc.markPresent(presencial.id, actorId, NOW);
        // `ausente` nunca é marcado — precisa ter restrição=true mas continuar sem modalidade.

        const result = await svc.listCandidates({ page: 1, per_page: 25, status: "todos", search: marca }, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            const byName = (name: string) => result.value.items.find((item) => item.name === name);
            expect(byName(online.name)?.attendance).toBe("online");
            expect(byName(presencial.name)?.attendance).toBe("presencial");
            expect(byName(ausente.name)?.attendance).toBeNull();
        }
    });

    it("candidato sem candidate_applications (fixture incompleta) não conta como online — COALESCE trata como presencial", async () => {
        const svc = service();
        const actorId = await insertUser();
        const marca = crypto.randomUUID();
        const candidate = await insertCandidate({ name: `Attendance Sem Application ${marca}` });

        await svc.markPresent(candidate.id, actorId, NOW);

        const result = await svc.listCandidates({ page: 1, per_page: 25, status: "todos", search: marca }, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) expect(result.value.items[0]?.attendance).toBe("presencial");
    });

    it("FR-011 — attendanceSummary soma sobre todo o conjunto filtrado, não só a página", async () => {
        const svc = service();
        const actorId = await insertUser();
        const marca = crypto.randomUUID();

        const onlines = await Promise.all(
            [0, 1, 2].map(async (i) => {
                const c = await insertCandidate({ name: `Summary Online ${i} ${marca}` });
                await insertApplication(c.id, true);
                await svc.markPresent(c.id, actorId, NOW);
                return c;
            }),
        );
        const presencial = await insertCandidate({ name: `Summary Presencial ${marca}` });
        await insertApplication(presencial.id, false);
        await svc.markPresent(presencial.id, actorId, NOW);

        // per_page menor que o total — o resumo não pode refletir só a página.
        const result = await svc.listCandidates({ page: 1, per_page: 2, status: "todos", search: marca }, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.items).toHaveLength(2);
            expect(result.value.attendanceSummary).toEqual({ online: onlines.length, presencial: 1 });
        }
    });

    it("attendanceSummary conta só presentes — candidato ausente não entra em nenhum dos dois grupos", async () => {
        const svc = service();
        const marca = crypto.randomUUID();
        const candidate = await insertCandidate({ name: `Summary Ausente ${marca}` });
        await insertApplication(candidate.id, true);

        const result = await svc.listCandidates({ page: 1, per_page: 25, status: "todos", search: marca }, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) expect(result.value.attendanceSummary).toEqual({ online: 0, presencial: 0 });
    });
});

describe("CheckinService.listCandidates — filtro por modalidade (FEAT-0019)", () => {
    it("attendance=presencial filtra items, total e totalCandidates — sem online no meio", async () => {
        const svc = service();
        const actorId = await insertUser();
        const marca = crypto.randomUUID();

        const online = await insertCandidate({ name: `Filtro Online ${marca}` });
        await insertApplication(online.id, true);
        await svc.markPresent(online.id, actorId, NOW);
        const presencial = await insertCandidate({ name: `Filtro Presencial ${marca}` });
        await insertApplication(presencial.id, false);
        await svc.markPresent(presencial.id, actorId, NOW);

        const result = await svc.listCandidates(
            { page: 1, per_page: 25, status: "todos", search: marca, attendance: "presencial" },
            NOW,
        );

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.items).toHaveLength(1);
            expect(result.value.items[0]?.name).toBe(presencial.name);
            expect(result.value.pagination.total).toBe(1);
            expect(result.value.totalCandidates).toBe(1);
            expect(result.value.attendanceSummary).toEqual({ online: 0, presencial: 1 });
        }
    });

    it("attendance=online filtra items, total e totalCandidates — sem presencial no meio", async () => {
        const svc = service();
        const actorId = await insertUser();
        const marca = crypto.randomUUID();

        const online = await insertCandidate({ name: `Filtro Online 2 ${marca}` });
        await insertApplication(online.id, true);
        await svc.markPresent(online.id, actorId, NOW);
        const presencial = await insertCandidate({ name: `Filtro Presencial 2 ${marca}` });
        await insertApplication(presencial.id, false);
        await svc.markPresent(presencial.id, actorId, NOW);

        const result = await svc.listCandidates(
            { page: 1, per_page: 25, status: "todos", search: marca, attendance: "online" },
            NOW,
        );

        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
            expect(result.value.items).toHaveLength(1);
            expect(result.value.items[0]?.name).toBe(online.name);
            expect(result.value.totalCandidates).toBe(1);
            expect(result.value.attendanceSummary).toEqual({ online: 1, presencial: 0 });
        }
    });

    it("sem attendance, comportamento igual a hoje — as duas modalidades aparecem juntas", async () => {
        const svc = service();
        const actorId = await insertUser();
        const marca = crypto.randomUUID();

        const online = await insertCandidate({ name: `Filtro Ausente Online ${marca}` });
        await insertApplication(online.id, true);
        await svc.markPresent(online.id, actorId, NOW);
        const presencial = await insertCandidate({ name: `Filtro Ausente Presencial ${marca}` });
        await insertApplication(presencial.id, false);
        await svc.markPresent(presencial.id, actorId, NOW);

        const result = await svc.listCandidates({ page: 1, per_page: 25, status: "todos", search: marca }, NOW);

        expect(result.isRight()).toBe(true);
        if (result.isRight()) expect(result.value.items).toHaveLength(2);
    });
});

describe("CheckinService.listCandidates — cache em KV inclui `attendance` na chave (FEAT-0019)", () => {
    it("filtrar por modalidades diferentes não reaproveita o cache da outra modalidade", async () => {
        const svc = serviceWithCache();
        const marca = crypto.randomUUID();
        const online = await insertCandidate({ name: `Cache Attendance Online ${marca}` });
        await insertApplication(online.id, true);
        const presencial = await insertCandidate({ name: `Cache Attendance Presencial ${marca}` });
        await insertApplication(presencial.id, false);

        const onlineResult = await svc.listCandidates(
            { page: 1, per_page: 25, status: "todos", search: marca, attendance: "online" },
            NOW,
        );
        const presencialResult = await svc.listCandidates(
            { page: 1, per_page: 25, status: "todos", search: marca, attendance: "presencial" },
            NOW,
        );

        expect(onlineResult.isRight() && presencialResult.isRight()).toBe(true);
        if (onlineResult.isRight() && presencialResult.isRight()) {
            expect(onlineResult.value.items).toHaveLength(1);
            expect(onlineResult.value.items[0]?.name).toBe(online.name);
            expect(presencialResult.value.items).toHaveLength(1);
            expect(presencialResult.value.items[0]?.name).toBe(presencial.name);
        }
    });
});
