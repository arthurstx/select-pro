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
