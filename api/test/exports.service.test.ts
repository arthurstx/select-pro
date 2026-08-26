import { env } from "cloudflare:test";
import type { ExportCandidatesQuery } from "shared";
import { beforeEach, describe, expect, it } from "vitest";

import { SelectionProcessNotFoundError } from "../src/core/errors/checkin-errors";
import { ExportsRepository } from "../src/repositories/exports.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { ExportsService } from "../src/services/exports.service";

// D1 real via miniflare. Lógica de negócio da FEAT-0016; a camada HTTP
// (401/403, Content-Type/Content-Disposition) está em exports.routes.test.ts.
//
// Armazenamento NÃO isolado entre `it()` deste pool (mesmo aviso de
// dashboard.service.test.ts) — por isso o `beforeEach` limpa `candidates`
// (CASCADE cuida de `candidate_applications`) e `candidate_export_events`.

const EDICAO_2026_1 = "a1cc2644-d85c-44a7-87cb-60781d8d7464";
const EDICAO_2026_2 = "ace24839-ec23-4942-9065-dbd45742034e";

const ACTOR_ID = crypto.randomUUID();

beforeEach(async () => {
    await env.DB.exec("DELETE FROM candidates");
    await env.DB.exec("DELETE FROM candidate_export_events");
    await env.DB.exec("DELETE FROM selection_processes WHERE label NOT IN ('2026.1', '2026.2')");

    await env.DB.prepare("INSERT OR IGNORE INTO users (id, role_id, email, name) VALUES (?, 'admin', ?, 'Admin de teste')")
        .bind(ACTOR_ID, `admin-export-${ACTOR_ID}@example.com`)
        .run();
});

function service(): ExportsService {
    return new ExportsService(new ExportsRepository(env.DB), new SelectionProcessRepository(env.DB));
}

let counter = 0;

interface CandidateOverrides {
    processId?: string;
    name?: string;
    createdAt?: string;
    gender?: string;
    ethnicity?: string;
    referralSource?: string;
    referralSourceOther?: string | null;
    saturdayRestriction?: boolean;
    specialNeeds?: boolean;
}

async function insertCandidate(overrides: CandidateOverrides = {}) {
    counter += 1;
    const id = crypto.randomUUID();
    const processId = overrides.processId ?? EDICAO_2026_2;
    const createdAt = overrides.createdAt ?? "2026-08-05 12:00:00";

    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, ?, 'eng-computacao', 3, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            id,
            processId,
            overrides.gender ?? "feminino",
            overrides.ethnicity ?? "parda",
            overrides.name ?? `Candidato Export ${counter}`,
            `candidato-export-${counter}@example.com`,
            `+557198888${String(counter).padStart(4, "0")}`,
            createdAt,
        )
        .run();

    await env.DB.prepare(
        `INSERT INTO candidate_applications
            (id, candidate_id, referral_source, referral_source_other, mej_acknowledged, experience, motivation, saturday_restriction, special_needs)
         VALUES (?, ?, ?, ?, 1, 'exp', 'mot', ?, ?)`,
    )
        .bind(
            crypto.randomUUID(),
            id,
            overrides.referralSource ?? "instagram",
            overrides.referralSourceOther ?? null,
            overrides.saturdayRestriction ? 1 : 0,
            overrides.specialNeeds ? 1 : 0,
        )
        .run();

    return id;
}

function query(overrides: Partial<ExportCandidatesQuery> = {}): ExportCandidatesQuery {
    return { include_sensitive: false, ...overrides };
}

describe("ExportsService.export", () => {
    it("US1 - CSV com cabeçalho + 1 linha por candidato da edição pedida", async () => {
        await insertCandidate({ processId: EDICAO_2026_2, name: "Ana" });
        await insertCandidate({ processId: EDICAO_2026_2, name: "Bruno" });
        await insertCandidate({ processId: EDICAO_2026_1, name: "Fora da edição" });

        const result = await service().export(query({ process_id: EDICAO_2026_2 }), ACTOR_ID);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) throw new Error("esperava sucesso");

        const lines = result.value.csv.trim().split("\r\n");
        expect(lines).toHaveLength(3); // cabeçalho + 2 candidatos
        expect(result.value.rowCount).toBe(2);
        expect(lines[0]).toContain("nome");
        expect(lines.some((line) => line.includes("Ana"))).toBe(true);
        expect(lines.some((line) => line.includes("Bruno"))).toBe(true);
        expect(lines.some((line) => line.includes("Fora da edição"))).toBe(false);
    });

    it("US1 - recorte 'all' inclui candidatos de todas as edições", async () => {
        await insertCandidate({ processId: EDICAO_2026_1, name: "Um" });
        await insertCandidate({ processId: EDICAO_2026_2, name: "Dois" });

        const result = await service().export(query({ process_id: "all" }), ACTOR_ID);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) throw new Error("esperava sucesso");
        expect(result.value.rowCount).toBe(2);
    });

    it("US1 - edição sem candidatos gera CSV só com cabeçalho", async () => {
        const result = await service().export(query({ process_id: EDICAO_2026_1 }), ACTOR_ID);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) throw new Error("esperava sucesso");
        expect(result.value.rowCount).toBe(0);
        expect(result.value.csv.trim().split("\r\n")).toHaveLength(1);
    });

    it("FR-008 - edição inexistente devolve SelectionProcessNotFoundError, sem gerar CSV nem evento", async () => {
        const result = await service().export(query({ process_id: crypto.randomUUID() }), ACTOR_ID);

        expect(result.isLeft()).toBe(true);
        if (!result.isLeft()) throw new Error("esperava falha");
        expect(result.value).toBeInstanceOf(SelectionProcessNotFoundError);

        const { results } = await env.DB.prepare("SELECT * FROM candidate_export_events").all();
        expect(results).toHaveLength(0);
    });

    it("filtro de busca por nome", async () => {
        await insertCandidate({ processId: EDICAO_2026_2, name: "Fulano de Tal" });
        await insertCandidate({ processId: EDICAO_2026_2, name: "Outro Nome" });

        const result = await service().export(
            query({ process_id: EDICAO_2026_2, search: "fulano" }),
            ACTOR_ID,
        );

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) throw new Error("esperava sucesso");
        expect(result.value.rowCount).toBe(1);
    });

    it("filtro de intervalo de data (from/to), inclusive", async () => {
        await insertCandidate({ processId: EDICAO_2026_2, createdAt: "2026-08-01 08:00:00" });
        await insertCandidate({ processId: EDICAO_2026_2, createdAt: "2026-08-10 08:00:00" });
        await insertCandidate({ processId: EDICAO_2026_2, createdAt: "2026-08-20 08:00:00" });

        const result = await service().export(
            query({ process_id: EDICAO_2026_2, from: "2026-08-05", to: "2026-08-10" }),
            ACTOR_ID,
        );

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) throw new Error("esperava sucesso");
        expect(result.value.rowCount).toBe(1);
    });

    describe("US2 - include_sensitive", () => {
        it("false (default) nunca inclui as colunas genero/etnia", async () => {
            await insertCandidate({ processId: EDICAO_2026_2, gender: "masculino", ethnicity: "preta" });

            const result = await service().export(query({ process_id: EDICAO_2026_2 }), ACTOR_ID);

            expect(result.isRight()).toBe(true);
            if (!result.isRight()) throw new Error("esperava sucesso");
            expect(result.value.csv).not.toContain("genero");
            expect(result.value.csv).not.toContain("etnia");
        });

        it("true acrescenta genero/etnia com os valores corretos", async () => {
            await insertCandidate({ processId: EDICAO_2026_2, name: "Sensível", gender: "masculino", ethnicity: "preta" });

            const result = await service().export(
                query({ process_id: EDICAO_2026_2, include_sensitive: true }),
                ACTOR_ID,
            );

            expect(result.isRight()).toBe(true);
            if (!result.isRight()) throw new Error("esperava sucesso");
            const [header, row] = result.value.csv.trim().split("\r\n");
            expect(header).toContain("genero");
            expect(header).toContain("etnia");
            expect(row).toContain("Masculino");
            expect(row).toContain("Preta");
        });
    });

    describe("US3 - auditoria", () => {
        it("cada exportação bem-sucedida grava exatamente um evento com os campos corretos", async () => {
            await insertCandidate({ processId: EDICAO_2026_2 });

            await service().export(query({ process_id: EDICAO_2026_2, include_sensitive: true }), ACTOR_ID);

            const { results } = await env.DB.prepare(
                "SELECT * FROM candidate_export_events WHERE actor_id = ?",
            )
                .bind(ACTOR_ID)
                .all<{
                    actor_id: string;
                    process_id: string | null;
                    process_label: string;
                    included_sensitive_fields: number;
                    row_count: number;
                }>();

            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                actor_id: ACTOR_ID,
                process_id: EDICAO_2026_2,
                process_label: "2026.2",
                included_sensitive_fields: 1,
                row_count: 1,
            });
        });

        it("recorte 'all' grava process_id NULL e process_label 'Todas as edições'", async () => {
            await insertCandidate({ processId: EDICAO_2026_2 });

            await service().export(query({ process_id: "all" }), ACTOR_ID);

            const { results } = await env.DB.prepare(
                "SELECT * FROM candidate_export_events WHERE actor_id = ? ORDER BY created_at DESC LIMIT 1",
            )
                .bind(ACTOR_ID)
                .all<{ process_id: string | null; process_label: string }>();

            expect(results[0]).toMatchObject({ process_id: null, process_label: "Todas as edições" });
        });

        it("FR-009 - falha ao gravar o evento propaga erro e não é capturada como Either", async () => {
            await insertCandidate({ processId: EDICAO_2026_2 });

            // Ator inexistente viola a FK de candidate_export_events.actor_id
            // (ON DELETE RESTRICT exige que a linha exista) — simula falha
            // técnica de INSERT sem precisar derrubar o D1.
            const invalidActorId = crypto.randomUUID();

            await expect(
                service().export(query({ process_id: EDICAO_2026_2 }), invalidActorId),
            ).rejects.toThrow();
        });
    });
});
