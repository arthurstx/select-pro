import { describe, expect, it } from "vitest";

import { parseD1ConstraintError } from "../../src/lib/d1-errors";

describe("parseD1ConstraintError", () => {
    it("identifica violação de UNIQUE em candidates.email", () => {
        const error = new Error("D1_ERROR: UNIQUE constraint failed: candidates.email: SQLITE_CONSTRAINT");
        expect(parseD1ConstraintError(error)).toBe("email");
    });

    it("identifica violação de UNIQUE em candidates.phone", () => {
        const error = new Error("D1_ERROR: UNIQUE constraint failed: candidates.phone: SQLITE_CONSTRAINT");
        expect(parseD1ConstraintError(error)).toBe("phone");
    });

    // A partir da FEAT-0006 a unicidade é composta — mensagens abaixo são as
    // que o SQLite realmente emite, capturadas rodando os INSERTs no D1 local.

    it("na constraint composta, reporta o email — não o process_id", () => {
        const error = new Error(
            "UNIQUE constraint failed: candidates.process_id, candidates.email: SQLITE_CONSTRAINT",
        );
        // `process_id` faz parte da constraint mas não é campo do formulário:
        // devolvê-lo faria o candidato receber um 409 apontando para algo que
        // ele nem preencheu.
        expect(parseD1ConstraintError(error)).toBe("email");
    });

    it("na constraint composta, reporta o telefone", () => {
        const error = new Error(
            "UNIQUE constraint failed: candidates.process_id, candidates.phone: SQLITE_CONSTRAINT",
        );
        expect(parseD1ConstraintError(error)).toBe("phone");
    });

    it("retorna null para violação de UNIQUE em outra tabela/coluna", () => {
        const error = new Error("UNIQUE constraint failed: users.email");
        expect(parseD1ConstraintError(error)).toBeNull();
    });

    it("retorna null para erros que não são de constraint", () => {
        expect(parseD1ConstraintError(new Error("SQLITE_BUSY: database is locked"))).toBeNull();
    });

    it("retorna null para valores que não são Error (ex: string lançada diretamente)", () => {
        expect(parseD1ConstraintError("algo deu errado")).toBeNull();
    });
});
