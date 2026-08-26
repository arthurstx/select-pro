import { env } from "cloudflare:test";
import type { DashboardCandidatesQuery } from "shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { Either } from "../src/core/either";
import { DashboardCache } from "../src/lib/dashboard-cache";
import { DashboardRepository } from "../src/repositories/dashboard.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { DashboardService } from "../src/services/dashboard.service";

// D1 e KV reais via miniflare. Aqui mora a lógica de negócio da FEAT-0007; a
// camada HTTP (401/403, CORS, manutenção, envelope de erro) está em
// dashboard.routes.test.ts.
//
// ⚠️ O armazenamento NÃO é isolado entre os `it` deste pool, apesar do que
// diz o comentário de checkin.service.test.ts. Lá isso não aparece porque
// toda asserção é escopada por um nome de busca único ou por um id
// específico; aqui, métricas são contagens globais, e uma linha vazada de
// outro teste muda o resultado. Daí o `beforeEach` abaixo — mesmo contorno
// que sheet-sync.service.test.ts já usava.

const EDICAO_2026_1 = "a1cc2644-d85c-44a7-87cb-60781d8d7464";
const EDICAO_2026_2 = "ace24839-ec23-4942-9065-dbd45742034e";

/** Dentro da janela de 2026.2 — `now` explícito para os testes não dependerem do relógio. */
const AGORA = new Date("2026-08-15T12:00:00Z");

let counter = 0;

beforeEach(async () => {
    // `candidate_applications` cai por CASCADE.
    await env.DB.exec("DELETE FROM candidates");
    // A edição criada sob demanda pelo teste de catálogo não pode sobrar.
    await env.DB.exec("DELETE FROM selection_processes WHERE label NOT IN ('2026.1', '2026.2')");

    // As chaves do cache são as MESMAS entre testes (mesma edição, mesmo
    // papel, mesmo modo) — sem esta limpeza, um teste serviria o resultado
    // cacheado do anterior.
    const { keys } = await env.CANDIDATES_KV.list({ prefix: "dashboard:" });
    await Promise.all(keys.map((key) => env.CANDIDATES_KV.delete(key.name)));
});

/** Sem cache: a maioria dos testes quer ler o D1 direto, sem TTL no caminho. */
function service(): DashboardService {
    return new DashboardService(new DashboardRepository(env.DB), new SelectionProcessRepository(env.DB));
}

/** Com cache — só para os testes que existem para provar que ele funciona. */
function serviceWithCache(): DashboardService {
    return new DashboardService(
        new DashboardRepository(env.DB),
        new SelectionProcessRepository(env.DB),
        new DashboardCache(env.CANDIDATES_KV),
    );
}

interface CandidateOverrides {
    name?: string;
    createdAt?: string;
    course?: string;
    semester?: number;
    gender?: string;
    ethnicity?: string;
    referralSource?: string;
    referralSourceOther?: string | null;
    experience?: string;
    motivation?: string;
    saturdayRestriction?: boolean;
    specialNeeds?: boolean;
    specialNeedsDescription?: string | null;
}

/** Candidato + questionário, como a inscrição real grava (`db.batch` dos dois). */
async function insertCandidate(overrides: CandidateOverrides = {}) {
    counter += 1;
    const row = {
        id: crypto.randomUUID(),
        name: overrides.name ?? `Candidato Dash ${counter}`,
        email: `candidato-dash-${counter}@example.com`,
        phone: `+557197777${String(counter).padStart(4, "0")}`,
        course: overrides.course ?? "eng-computacao",
        semester: overrides.semester ?? 3,
        gender: overrides.gender ?? "feminino",
        ethnicity: overrides.ethnicity ?? "parda",
        created_at: overrides.createdAt ?? "2026-08-05 12:00:00",
    };

    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, (SELECT id FROM selection_processes WHERE ? BETWEEN starts_at AND ends_at), ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            row.id,
            row.created_at,
            row.course,
            row.semester,
            row.gender,
            row.ethnicity,
            row.name,
            row.email,
            row.phone,
            row.created_at,
        )
        .run();

    await env.DB.prepare(
        `INSERT INTO candidate_applications
            (id, candidate_id, referral_source, referral_source_other, mej_acknowledged, experience, motivation, saturday_restriction, special_needs, special_needs_description)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
        .bind(
            crypto.randomUUID(),
            row.id,
            overrides.referralSource ?? "instagram",
            overrides.referralSourceOther ?? null,
            overrides.experience ?? "Experiência do candidato.",
            overrides.motivation ?? "Motivação do candidato.",
            overrides.saturdayRestriction ? 1 : 0,
            overrides.specialNeeds ? 1 : 0,
            overrides.specialNeedsDescription ?? null,
        )
        .run();

    return row;
}

/** `isLeft()` é um type guard (`this is Left`), então o `return` já vem estreitado para `R`. */
function unwrap<L, R>(result: Either<L, R>): R {
    if (result.isLeft()) {
        throw new Error(`Esperava sucesso, veio erro: ${JSON.stringify(result.value)}`);
    }
    return result.value;
}

// ============================================================
// O corte por papel — o que esta feature existe para acertar
// ============================================================

describe("Corte por papel nas métricas", () => {
    it("admin recebe byGender e byEthnicity", async () => {
        await insertCandidate({ gender: "feminino", ethnicity: "parda" });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        expect(metrics.byGender).toEqual([{ key: "feminino", count: 1 }]);
        expect(metrics.byEthnicity).toEqual([{ key: "parda", count: 1 }]);
    });

    it("avaliador recebe as chaves AUSENTES — não vazias, não nulas", async () => {
        await insertCandidate({ gender: "feminino", ethnicity: "parda" });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "avaliador", AGORA));

        // `toHaveProperty` falharia com `{ byGender: undefined }`, que é
        // justamente o que NÃO queremos: a chave sumir só no JSON.stringify.
        expect(metrics).not.toHaveProperty("byGender");
        expect(metrics).not.toHaveProperty("byEthnicity");
        expect(Object.keys(metrics)).not.toContain("byGender");

        // Mas continua vendo tudo que é operacional.
        expect(metrics.totals.candidates).toBe(1);
        expect(metrics.byCourse).toHaveLength(1);
        expect(metrics.byReferralSource).toHaveLength(1);
    });

    it("avaliador não recebe `demographics` no detalhe; admin recebe", async () => {
        const candidate = await insertCandidate({ gender: "masculino", ethnicity: "preta" });

        const paraAvaliador = unwrap(await service().detail(candidate.id, "avaliador"));
        const paraAdmin = unwrap(await service().detail(candidate.id, "admin"));

        expect(paraAvaliador).not.toHaveProperty("demographics");
        expect(paraAdmin.demographics).toEqual({ gender: "masculino", ethnicity: "preta" });

        // A restrição é demográfica, não de conteúdo: ler o questionário é o
        // trabalho do avaliador (FEAT-0007, seção 10, pergunta 9).
        expect(paraAvaliador.application.experience).toBe("Experiência do candidato.");
        expect(paraAvaliador.application.motivation).toBe("Motivação do candidato.");
    });

    it("o cache não serve a resposta de admin para um avaliador", async () => {
        await insertCandidate({ gender: "feminino", ethnicity: "parda" });
        const cached = serviceWithCache();

        // Admin primeiro: é a resposta com demografia que fica no KV.
        const doAdmin = unwrap(await cached.metrics({ mode: "sum" }, "admin", AGORA));
        expect(doAdmin.byGender).toBeDefined();

        const doAvaliador = unwrap(await cached.metrics({ mode: "sum" }, "avaliador", AGORA));

        expect(doAvaliador).not.toHaveProperty("byGender");
        expect(doAvaliador).not.toHaveProperty("byEthnicity");
    });

    it("a segunda leitura do mesmo papel vem do cache", async () => {
        await insertCandidate();
        const cached = serviceWithCache();

        const primeira = unwrap(await cached.metrics({ mode: "sum" }, "admin", AGORA));
        expect(primeira.totals.candidates).toBe(1);

        // Inscrição nova entra no D1 mas não invalida nada: TTL de 60s, sem
        // invalidação por geração (FEAT-0007, seção 9).
        await insertCandidate();
        const segunda = unwrap(await cached.metrics({ mode: "sum" }, "admin", AGORA));

        expect(segunda.totals.candidates).toBe(1);
    });
});

// ============================================================
// Recorte de edição
// ============================================================

describe("Recorte de edição", () => {
    it("`process_id` ausente devolve a edição corrente", async () => {
        await insertCandidate({ createdAt: "2026-08-05 12:00:00" });
        await insertCandidate({ createdAt: "2026-03-10 09:00:00" }); // 2026.1

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        expect(metrics.scope).toEqual({ kind: "edition", process: { id: EDICAO_2026_2, label: "2026.2" } });
        expect(metrics.totals.candidates).toBe(1);
    });

    it("um uuid devolve aquela edição", async () => {
        await insertCandidate({ createdAt: "2026-08-05 12:00:00" });
        await insertCandidate({ createdAt: "2026-03-10 09:00:00" });

        const metrics = unwrap(await service().metrics({ process_id: EDICAO_2026_1, mode: "sum" }, "admin", AGORA));

        expect(metrics.scope).toEqual({ kind: "edition", process: { id: EDICAO_2026_1, label: "2026.1" } });
        expect(metrics.totals.candidates).toBe(1);
    });

    it("`all` soma as edições e omite `scope.process`", async () => {
        await insertCandidate({ createdAt: "2026-08-05 12:00:00" });
        await insertCandidate({ createdAt: "2026-03-10 09:00:00" });

        const metrics = unwrap(await service().metrics({ process_id: "all", mode: "sum" }, "admin", AGORA));

        expect(metrics.scope).toEqual({ kind: "all" });
        expect(metrics.scope).not.toHaveProperty("process");
        expect(metrics.totals.candidates).toBe(2);
    });

    it("E3 — `process_id` inexistente", async () => {
        const result = await service().metrics(
            { process_id: "00000000-0000-4000-8000-000000000000", mode: "sum" },
            "admin",
            AGORA,
        );

        expect(result.isLeft()).toBe(true);
        expect((result.value as { code: string }).code).toBe("SELECTION_PROCESS_NOT_FOUND");
    });
});

// ============================================================
// Agregações
// ============================================================

describe("Agregações", () => {
    it("a soma das distribuições bate com o total de inscritos", async () => {
        await insertCandidate({ course: "eng-computacao", semester: 3, gender: "feminino" });
        await insertCandidate({ course: "eng-civil", semester: 3, gender: "masculino" });
        await insertCandidate({ course: "eng-civil", semester: 5, gender: "feminino" });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));
        const somaDe = (items: { count: number }[]) => items.reduce((total, item) => total + item.count, 0);

        expect(metrics.totals.candidates).toBe(3);
        expect(somaDe(metrics.byCourse)).toBe(3);
        expect(somaDe(metrics.bySemester)).toBe(3);
        expect(somaDe(metrics.byGender ?? [])).toBe(3);
    });

    it("conta cursos representados sobre o total de cursos existentes", async () => {
        await insertCandidate({ course: "eng-computacao" });
        await insertCandidate({ course: "eng-computacao" });
        await insertCandidate({ course: "arquitetura" });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        expect(metrics.totals.coursesRepresented).toBe(2);
        expect(metrics.totals.coursesTotal).toBe(8);
    });

    it("conta necessidade especial e restrição de sábado", async () => {
        await insertCandidate({ specialNeeds: true, saturdayRestriction: true });
        await insertCandidate({ specialNeeds: false, saturdayRestriction: true });
        await insertCandidate({ specialNeeds: false, saturdayRestriction: false });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        expect(metrics.totals.specialNeeds).toBe(1);
        expect(metrics.totals.saturdayRestriction).toBe(2);
    });

    it("FEAT-0014: totals.specialNeeds continua um número — nenhum texto de descrição vaza para o agregado (FR-010)", async () => {
        await insertCandidate({ specialNeeds: true, specialNeedsDescription: "Uso cadeira de rodas." });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        expect(typeof metrics.totals.specialNeeds).toBe("number");
        expect(JSON.stringify(metrics.totals)).not.toMatch(/cadeira/);
    });

    it("ordena semestre por valor, e as demais séries por contagem", async () => {
        await insertCandidate({ course: "eng-civil", semester: 8 });
        await insertCandidate({ course: "eng-computacao", semester: 2 });
        await insertCandidate({ course: "eng-computacao", semester: 2 });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        // Um eixo de semestres ordenado por contagem seria ilegível.
        expect(metrics.bySemester.map((item) => item.key)).toEqual([2, 8]);
        expect(metrics.byCourse.map((item) => item.key)).toEqual(["eng-computacao", "eng-civil"]);
    });

    it("`by_edition` quebra as distribuições por edição, sem mudar o total", async () => {
        await insertCandidate({ course: "eng-civil", createdAt: "2026-08-05 12:00:00" });
        await insertCandidate({ course: "eng-civil", createdAt: "2026-03-10 09:00:00" });

        const metrics = unwrap(await service().metrics({ process_id: "all", mode: "by_edition" }, "admin", AGORA));
        const civil = metrics.byCourse.find((item) => item.key === "eng-civil");

        expect(civil?.count).toBe(2);
        // Da mais recente para a mais antiga, como `listAll` devolve.
        expect(civil?.byEdition).toEqual([
            { process: { id: EDICAO_2026_2, label: "2026.2" }, count: 1 },
            { process: { id: EDICAO_2026_1, label: "2026.1" }, count: 1 },
        ]);
    });

    it("`by_edition` numa edição só é equivalente a `sum` — o parâmetro é ignorado", async () => {
        await insertCandidate({ course: "eng-civil" });

        const comparativo = unwrap(await service().metrics({ process_id: EDICAO_2026_2, mode: "by_edition" }, "admin", AGORA));
        const soma = unwrap(await service().metrics({ process_id: EDICAO_2026_2, mode: "sum" }, "admin", AGORA));

        expect(comparativo).toEqual(soma);
        expect(comparativo.byCourse[0]).not.toHaveProperty("byEdition");
    });

    it("base vazia devolve zeros, não erro", async () => {
        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        expect(metrics.totals.candidates).toBe(0);
        expect(metrics.totals.coursesRepresented).toBe(0);
        expect(metrics.byCourse).toEqual([]);
        expect(metrics.byDay).toEqual([]);
    });
});

// ============================================================
// Inscritos por dia
// ============================================================

describe("`byDay` — inscritos por dia", () => {
    it("preenche com zero os dias sem inscrição entre o primeiro e o último dia com dado", async () => {
        await insertCandidate({ createdAt: "2026-08-05 09:00:00" });
        await insertCandidate({ createdAt: "2026-08-05 20:00:00" }); // mesmo dia, soma na mesma chave
        await insertCandidate({ createdAt: "2026-08-08 09:00:00" });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        expect(metrics.byDay).toEqual([
            { key: "2026-08-05", count: 2 },
            { key: "2026-08-06", count: 0 },
            { key: "2026-08-07", count: 0 },
            { key: "2026-08-08", count: 1 },
        ]);
    });

    it("não estende o intervalo até hoje — só até o último dia com inscrição", async () => {
        await insertCandidate({ createdAt: "2026-08-05 09:00:00" });

        // `AGORA` é 2026-08-15: se o preenchimento fosse até "hoje", a série
        // teria 11 dias em vez de 1.
        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        expect(metrics.byDay).toEqual([{ key: "2026-08-05", count: 1 }]);
    });

    it("é visível para `avaliador` — data de inscrição não é dado demográfico", async () => {
        await insertCandidate({ createdAt: "2026-08-05 09:00:00" });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "avaliador", AGORA));

        expect(metrics.byDay).toEqual([{ key: "2026-08-05", count: 1 }]);
    });

    it("`by_edition` quebra cada dia por edição, zero-preenchendo quem não inscreveu naquele dia", async () => {
        await insertCandidate({ createdAt: "2026-08-05 09:00:00" }); // 2026.2
        await insertCandidate({ createdAt: "2026-03-10 09:00:00" }); // 2026.1

        const metrics = unwrap(await service().metrics({ process_id: "all", mode: "by_edition" }, "admin", AGORA));

        // O intervalo cobre as duas edições: do primeiro dia com dado (2026.1) ao último (2026.2).
        const primeiro = metrics.byDay[0];
        const ultimo = metrics.byDay[metrics.byDay.length - 1];

        expect(primeiro).toEqual({
            key: "2026-03-10",
            count: 1,
            byEdition: [
                { process: { id: EDICAO_2026_2, label: "2026.2" }, count: 0 },
                { process: { id: EDICAO_2026_1, label: "2026.1" }, count: 1 },
            ],
        });
        expect(ultimo).toEqual({
            key: "2026-08-05",
            count: 1,
            byEdition: [
                { process: { id: EDICAO_2026_2, label: "2026.2" }, count: 1 },
                { process: { id: EDICAO_2026_1, label: "2026.1" }, count: 0 },
            ],
        });
    });
});

// ============================================================
// Listagem
// ============================================================

describe("Listagem de inscritos", () => {
    const query = (overrides: Partial<DashboardCandidatesQuery> = {}): DashboardCandidatesQuery => ({
        page: 1,
        per_page: 25,
        sort: "recent",
        ...overrides,
    });

    it("ordena da inscrição mais recente para a mais antiga por padrão", async () => {
        await insertCandidate({ name: "Primeira", createdAt: "2026-08-02 08:00:00" });
        await insertCandidate({ name: "Ultima", createdAt: "2026-08-20 08:00:00" });
        await insertCandidate({ name: "Meio", createdAt: "2026-08-10 08:00:00" });

        const result = unwrap(await service().listCandidates(query(), "avaliador", AGORA));

        expect(result.items.map((item) => item.name)).toEqual(["Ultima", "Meio", "Primeira"]);
    });

    it("`sort: oldest` inverte para a mais antiga primeiro", async () => {
        await insertCandidate({ name: "Primeira", createdAt: "2026-08-02 08:00:00" });
        await insertCandidate({ name: "Ultima", createdAt: "2026-08-20 08:00:00" });
        await insertCandidate({ name: "Meio", createdAt: "2026-08-10 08:00:00" });

        const result = unwrap(await service().listCandidates(query({ sort: "oldest" }), "avaliador", AGORA));

        expect(result.items.map((item) => item.name)).toEqual(["Primeira", "Meio", "Ultima"]);
    });

    it("`sort` diferente não reaproveita o cache de outro sort", async () => {
        await insertCandidate({ name: "Primeira", createdAt: "2026-08-02 08:00:00" });
        await insertCandidate({ name: "Ultima", createdAt: "2026-08-20 08:00:00" });
        const cached = serviceWithCache();

        const recente = unwrap(await cached.listCandidates(query({ sort: "recent" }), "admin", AGORA));
        const antiga = unwrap(await cached.listCandidates(query({ sort: "oldest" }), "admin", AGORA));

        expect(recente.items.map((item) => item.name)).toEqual(["Ultima", "Primeira"]);
        expect(antiga.items.map((item) => item.name)).toEqual(["Primeira", "Ultima"]);
    });

    it("nunca traz demografia nem os textos longos, para papel nenhum", async () => {
        await insertCandidate();

        const result = unwrap(await service().listCandidates(query(), "admin", AGORA));

        expect(result.items[0]).not.toHaveProperty("gender");
        expect(result.items[0]).not.toHaveProperty("ethnicity");
        expect(result.items[0]).not.toHaveProperty("experience");
        expect(result.items[0]).not.toHaveProperty("motivation");
    });

    it("cada item traz a própria edição — é o que distingue a recandidatura", async () => {
        await insertCandidate({ name: "Recandidato", createdAt: "2026-08-05 12:00:00" });
        await insertCandidate({ name: "Recandidato", createdAt: "2026-03-10 09:00:00" });

        const result = unwrap(await service().listCandidates(query({ process_id: "all" }), "admin", AGORA));

        expect(result.items.map((item) => item.process.label)).toEqual(["2026.2", "2026.1"]);
    });

    it("busca por nome é parcial e ignora maiúsculas", async () => {
        await insertCandidate({ name: "Maria Aparecida" });
        await insertCandidate({ name: "João Pedro" });

        const result = unwrap(await service().listCandidates(query({ search: "apareci" }), "admin", AGORA));

        expect(result.items).toHaveLength(1);
        expect(result.pagination.total).toBe(1);
    });

    it("filtra por intervalo de data, com `to` inclusive até o fim do dia", async () => {
        await insertCandidate({ name: "Dentro", createdAt: "2026-08-12 23:30:00" });
        await insertCandidate({ name: "Fora", createdAt: "2026-08-13 00:30:00" });

        const result = unwrap(
            await service().listCandidates(query({ from: "2026-08-12", to: "2026-08-12" }), "admin", AGORA),
        );

        expect(result.items.map((item) => item.name)).toEqual(["Dentro"]);
    });

    it("busca e intervalo se combinam na mesma consulta, e `total` reflete o filtro", async () => {
        await insertCandidate({ name: "Ana Silva", createdAt: "2026-08-10 10:00:00" });
        await insertCandidate({ name: "Ana Souza", createdAt: "2026-08-25 10:00:00" });
        await insertCandidate({ name: "Bruno Silva", createdAt: "2026-08-10 10:00:00" });

        const result = unwrap(
            await service().listCandidates(
                query({ search: "ana", from: "2026-08-01", to: "2026-08-15" }),
                "admin",
                AGORA,
            ),
        );

        expect(result.items.map((item) => item.name)).toEqual(["Ana Silva"]);
        expect(result.pagination.total).toBe(1);
    });

    it("E8 — intervalo fora da janela da edição devolve lista vazia, não erro", async () => {
        // Edição 2026.1 vai de janeiro a julho; o intervalo é de agosto.
        await insertCandidate({ createdAt: "2026-03-10 09:00:00" });

        const result = await service().listCandidates(
            query({ process_id: EDICAO_2026_1, from: "2026-08-01", to: "2026-08-31" }),
            "admin",
            AGORA,
        );

        expect(result.isLeft()).toBe(false);
        expect(unwrap(result).items).toEqual([]);
        expect(unwrap(result).pagination.total).toBe(0);
    });

    it("pagina sem repetir nem perder linha", async () => {
        for (let index = 0; index < 5; index += 1) {
            await insertCandidate({ createdAt: `2026-08-0${index + 1} 10:00:00` });
        }

        const primeira = unwrap(await service().listCandidates(query({ per_page: 2 }), "admin", AGORA));
        const segunda = unwrap(await service().listCandidates(query({ page: 2, per_page: 2 }), "admin", AGORA));

        expect(primeira.pagination).toEqual({ page: 1, perPage: 2, total: 5, totalPages: 3 });
        expect(primeira.items).toHaveLength(2);
        expect(segunda.items).toHaveLength(2);
        const ids = [...primeira.items, ...segunda.items].map((item) => item.id);
        expect(new Set(ids).size).toBe(4);
    });

    // FEAT-0015 — filtro por curso.
    it("filtro por curso: retorna só candidatos do curso pedido", async () => {
        const marca = crypto.randomUUID();
        await insertCandidate({ name: `Curso Comp ${marca}`, course: "eng-computacao" });
        await insertCandidate({ name: `Curso Civil ${marca}`, course: "eng-civil" });

        const result = unwrap(
            await service().listCandidates(query({ search: marca, course: "eng-computacao" }), "admin", AGORA),
        );

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.course).toBe("eng-computacao");
    });

    it("filtro por curso combina com process_id, busca, intervalo de data e sort", async () => {
        const marca = crypto.randomUUID();
        await insertCandidate({ name: `Combo Comp Dentro ${marca}`, course: "eng-computacao", createdAt: "2026-08-10 10:00:00" });
        await insertCandidate({ name: `Combo Comp Fora ${marca}`, course: "eng-computacao", createdAt: "2026-08-25 10:00:00" });
        await insertCandidate({ name: `Combo Civil Dentro ${marca}`, course: "eng-civil", createdAt: "2026-08-10 10:00:00" });

        const result = unwrap(
            await service().listCandidates(
                query({
                    search: marca,
                    course: "eng-computacao",
                    from: "2026-08-01",
                    to: "2026-08-15",
                    process_id: "all",
                }),
                "admin",
                AGORA,
            ),
        );

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.name).toBe(`Combo Comp Dentro ${marca}`);
    });

    it("sem `course` no filtro, comportamento idêntico ao atual (todos os cursos)", async () => {
        const marca = crypto.randomUUID();
        await insertCandidate({ name: `Sem Filtro Comp ${marca}`, course: "eng-computacao" });
        await insertCandidate({ name: `Sem Filtro Civil ${marca}`, course: "eng-civil" });

        const result = unwrap(await service().listCandidates(query({ search: marca }), "admin", AGORA));

        expect(result.items).toHaveLength(2);
    });

    it("cursos diferentes não reaproveitam o cache um do outro", async () => {
        const marca = crypto.randomUUID();
        await insertCandidate({ name: `Cache Comp ${marca}`, course: "eng-computacao" });
        await insertCandidate({ name: `Cache Civil ${marca}`, course: "eng-civil" });
        const cached = serviceWithCache();

        const comp = unwrap(await cached.listCandidates(query({ search: marca, course: "eng-computacao" }), "admin", AGORA));
        const civil = unwrap(await cached.listCandidates(query({ search: marca, course: "eng-civil" }), "admin", AGORA));

        expect(comp.items).toHaveLength(1);
        expect(comp.items[0]?.course).toBe("eng-computacao");
        expect(civil.items).toHaveLength(1);
        expect(civil.items[0]?.course).toBe("eng-civil");
    });

    it("`DashboardCandidatesQuery` não tem `course` em `metrics()` — o filtro é exclusivo da listagem", async () => {
        // `metrics()` recebe `DashboardMetricsQuery`, que nunca teve (e continua sem ter) `course`.
        // Este teste documenta a garantia de FR-009: não há como um `course` vazar para os agregados.
        await insertCandidate({ course: "eng-computacao" });
        await insertCandidate({ course: "eng-civil" });

        const metrics = unwrap(await service().metrics({ mode: "sum" }, "admin", AGORA));

        // `byCourse` continua trazendo TODOS os cursos representados, sem nenhum recorte de curso.
        expect(metrics.byCourse.map((entry) => entry.key).sort()).toEqual(["eng-civil", "eng-computacao"]);
    });
});

// ============================================================
// Detalhe
// ============================================================

describe("Detalhe da inscrição", () => {
    it("E1 — candidato inexistente", async () => {
        const result = await service().detail(crypto.randomUUID(), "admin");

        expect(result.isLeft()).toBe(true);
        expect((result.value as { code: string }).code).toBe("CANDIDATE_NOT_FOUND");
    });

    it("devolve os textos na íntegra, sem truncar", async () => {
        const experience = "e".repeat(1000);
        const motivation = "m".repeat(500);
        const candidate = await insertCandidate({ experience, motivation });

        const detail = unwrap(await service().detail(candidate.id, "avaliador"));

        expect(detail.application.experience).toHaveLength(1000);
        expect(detail.application.motivation).toHaveLength(500);
        expect(detail.application.experience).toBe(experience);
    });

    it("não é filtrado por edição: abre alguém de 2026.1 com a tela em 2026.2", async () => {
        const candidate = await insertCandidate({ createdAt: "2026-03-10 09:00:00" });

        const detail = unwrap(await service().detail(candidate.id, "admin"));

        expect(detail.process).toEqual({ id: EDICAO_2026_1, label: "2026.1" });
    });

    it("converte os booleanos que o D1 devolve como 0/1", async () => {
        const candidate = await insertCandidate({ saturdayRestriction: true, specialNeeds: false });

        const detail = unwrap(await service().detail(candidate.id, "admin"));

        expect(detail.application.saturdayRestriction).toBe(true);
        expect(detail.application.specialNeeds).toBe(false);
    });

    it("FEAT-0014: expõe a descrição de necessidade especial no detalhe, para qualquer papel", async () => {
        const candidate = await insertCandidate({
            specialNeeds: true,
            specialNeedsDescription: "Uso cadeira de rodas — preciso de acesso sem escadas.",
        });

        const paraAvaliador = unwrap(await service().detail(candidate.id, "avaliador"));
        const paraAdmin = unwrap(await service().detail(candidate.id, "admin"));

        // Sem gate por papel — mesmo nível de acesso do boolean `specialNeeds` (spec 014, Assumptions).
        expect(paraAvaliador.application.specialNeedsDescription).toBe(
            "Uso cadeira de rodas — preciso de acesso sem escadas.",
        );
        expect(paraAdmin.application.specialNeedsDescription).toBe(
            "Uso cadeira de rodas — preciso de acesso sem escadas.",
        );
    });

    it("FEAT-0014: candidato com specialNeeds=true e sem descrição (legado) retorna null, sem quebrar (FR-007)", async () => {
        const candidate = await insertCandidate({ specialNeeds: true, specialNeedsDescription: null });

        const detail = unwrap(await service().detail(candidate.id, "admin"));

        expect(detail.application.specialNeeds).toBe(true);
        expect(detail.application.specialNeedsDescription).toBeNull();
    });

    it("FEAT-0014: candidato com specialNeeds=false nunca expõe descrição, mesmo se uma sobrou gravada", async () => {
        const candidate = await insertCandidate({ specialNeeds: false, specialNeedsDescription: "resíduo indevido" });

        const detail = unwrap(await service().detail(candidate.id, "admin"));

        expect(detail.application.specialNeeds).toBe(false);
        expect(detail.application.specialNeedsDescription).toBeNull();
    });

    it("`referralSourceOther` vem `null` quando a origem não é `outros`", async () => {
        const comOutro = await insertCandidate({ referralSource: "outros", referralSourceOther: "Feira da escola" });
        const semOutro = await insertCandidate({ referralSource: "instagram" });

        expect(unwrap(await service().detail(comOutro.id, "admin")).application.referralSourceOther).toBe(
            "Feira da escola",
        );
        expect(unwrap(await service().detail(semOutro.id, "admin")).application.referralSourceOther).toBeNull();
    });
});

// ============================================================
// Catálogo de edições
// ============================================================

describe("Catálogo de edições", () => {
    it("lista da mais recente para a mais antiga, com a corrente marcada", async () => {
        const result = unwrap(await service().editions(AGORA));

        expect(result.editions.map((edition) => edition.label)).toEqual(["2026.2", "2026.1"]);
        expect(result.current).toEqual({ id: EDICAO_2026_2, label: "2026.2" });
    });

    it("a edição corrente é criada sob demanda e já aparece na lista", async () => {
        // 2027.1 não está semeada — `resolveCurrent` a cria antes de listar.
        const result = unwrap(await service().editions(new Date("2027-02-10T12:00:00Z")));

        expect(result.current.label).toBe("2027.1");
        expect(result.editions.map((edition) => edition.label)).toContain("2027.1");
        expect(result.editions[0]?.label).toBe("2027.1");
    });
});
