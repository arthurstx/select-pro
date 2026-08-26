import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { CellValue, SheetsClient } from "../src/lib/google-sheets";
import { CandidateRepository } from "../src/repositories/candidates.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { SHEET_HEADER, SheetSyncService } from "../src/services/sheet-sync.service";

/** Planilha falsa: guarda linhas em memória e responde aos dois intervalos que o service lê. */
class FakeSheets implements SheetsClient {
    header: CellValue[] = [...SHEET_HEADER];
    rows: CellValue[][] = [];
    appendCalls = 0;

    async readValues(range: string): Promise<CellValue[][]> {
        if (range.endsWith("!A1:P1")) return this.header.length > 0 ? [this.header] : [];
        if (range.endsWith("!A2:A")) return this.rows.map((row) => [row[0]]);
        throw new Error(`Intervalo inesperado: ${range}`);
    }

    async appendRows(_range: string, rows: CellValue[][]): Promise<void> {
        this.appendCalls += 1;
        this.rows.push(...rows);
    }
}

let counter = 0;
async function insertCandidate(repo: CandidateRepository, overrides: { specialNeeds?: boolean; specialNeedsDescription?: string | null } = {}) {
    counter += 1;
    const id = crypto.randomUUID();
    const name = `Candidato ${counter}`;

    const process = await new SelectionProcessRepository(env.DB).resolveCurrent();
    const specialNeeds = overrides.specialNeeds ?? false;

    await repo.insertWithApplication(
        {
            id,
            process_id: process.id,
            name,
            email: `candidato${counter}@example.com`,
            phone: `+557199999${String(counter).padStart(4, "0")}`,
            course: "eng-computacao",
            semester: 3,
            gender: "feminino",
            ethnicity: "parda",
        },
        {
            id: crypto.randomUUID(),
            referral_source: "outros",
            referral_source_other: "Cartaz no mural",
            mej_acknowledged: true,
            experience: "Projetos de extensão.",
            motivation: "Aplicar na prática.",
            saturday_restriction: true,
            special_needs: specialNeeds,
            special_needs_description: specialNeeds ? (overrides.specialNeedsDescription ?? null) : null,
        },
    );

    return { id, name };
}

describe("SheetSyncService", () => {
    let repo: CandidateRepository;
    let sheets: FakeSheets;

    function buildService(maintenanceMode = false) {
        return new SheetSyncService(repo, sheets, { maintenanceMode });
    }

    beforeEach(async () => {
        repo = new CandidateRepository(env.DB);
        sheets = new FakeSheets();
        await env.DB.exec("DELETE FROM candidates");
    });

    it("escreve todas as inscrições quando a planilha só tem o cabeçalho", async () => {
        await insertCandidate(repo);
        await insertCandidate(repo);

        const result = await buildService().run();

        expect(result).toEqual({ status: "appended", count: 2 });
        expect(sheets.rows).toHaveLength(2);
    });

    it("formata a linha com rótulos por extenso, Sim/Não e a data de inscrição", async () => {
        const { id, name } = await insertCandidate(repo);

        await buildService().run();

        const row = sheets.rows.find((candidate) => candidate[0] === id);
        expect(row).toBeDefined();
        expect(row).toHaveLength(SHEET_HEADER.length);

        expect(row?.[2]).toBe(name);
        expect(row?.[5]).toBe("Engenharia de Computação"); // não o slug `eng-computacao`
        expect(row?.[7]).toBe("Feminino");
        expect(row?.[8]).toBe("Parda");
        expect(row?.[9]).toBe("Outros");
        expect(row?.[10]).toBe("Cartaz no mural");
        expect(row?.[13]).toBe("Sim"); // saturday_restriction
        expect(row?.[14]).toBe("Não"); // special_needs
        expect(row?.[15]).toBe(""); // special_needs_description — vazio quando special_needs é false
        expect(row?.[1]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it("FEAT-0014: leva a descrição de necessidade especial para a planilha", async () => {
        const { id } = await insertCandidate(repo, {
            specialNeeds: true,
            specialNeedsDescription: "Uso cadeira de rodas.",
        });

        await buildService().run();

        const row = sheets.rows.find((candidate) => candidate[0] === id);
        expect(row?.[14]).toBe("Sim");
        expect(row?.[15]).toBe("Uso cadeira de rodas.");
    });

    it("não escreve nada quando a planilha já está em dia", async () => {
        await insertCandidate(repo);

        const service = buildService();
        await service.run();
        const second = await service.run();

        expect(second).toEqual({ status: "up-to-date" });
        expect(sheets.appendCalls).toBe(1);
        expect(sheets.rows).toHaveLength(1);
    });

    it("acrescenta só as inscrições que faltam", async () => {
        await insertCandidate(repo);
        await buildService().run();

        const { id: novoId } = await insertCandidate(repo);
        const result = await buildService().run();

        expect(result).toEqual({ status: "appended", count: 1 });
        expect(sheets.rows).toHaveLength(2);
        expect(sheets.rows.at(-1)?.[0]).toBe(novoId);
    });

    it("reinsere uma linha apagada manualmente da planilha", async () => {
        const { id } = await insertCandidate(repo);
        await buildService().run();

        sheets.rows = [];
        const result = await buildService().run();

        expect(result).toEqual({ status: "appended", count: 1 });
        expect(sheets.rows[0]?.[0]).toBe(id);
    });

    it("aborta sem escrever quando o cabeçalho não confere (E4)", async () => {
        await insertCandidate(repo);
        sheets.header = ["id", "Nome trocado"];

        await expect(buildService().run()).rejects.toThrow(/Cabeçalho/);
        expect(sheets.appendCalls).toBe(0);
        expect(sheets.rows).toHaveLength(0);
    });

    it("aborta sem escrever quando a aba está totalmente vazia (E4)", async () => {
        await insertCandidate(repo);
        sheets.header = [];

        await expect(buildService().run()).rejects.toThrow(/Cabeçalho/);
        expect(sheets.appendCalls).toBe(0);
    });

    it("encerra sem ler o banco nem tocar na planilha em modo de manutenção (E7)", async () => {
        await insertCandidate(repo);

        const explodingRepo = {
            listAllWithApplication: () => {
                throw new Error("o banco não deveria ser lido em manutenção");
            },
        } as unknown as CandidateRepository;

        const service = new SheetSyncService(explodingRepo, sheets, { maintenanceMode: true });
        const result = await service.run();

        expect(result).toEqual({ status: "skipped", reason: "maintenance" });
        expect(sheets.appendCalls).toBe(0);
    });
});
