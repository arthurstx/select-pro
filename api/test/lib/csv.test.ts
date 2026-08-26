import { describe, expect, it } from "vitest";

import { toCsvField, toCsvRow } from "../../src/lib/csv";

describe("toCsvField (RFC 4180)", () => {
    it("devolve o valor cru quando não há caractere especial", () => {
        expect(toCsvField("João Silva")).toBe("João Silva");
        expect(toCsvField(42)).toBe("42");
        expect(toCsvField(true)).toBe("true");
    });

    it("null/undefined viram string vazia, nunca a literal 'null'/'undefined'", () => {
        expect(toCsvField(null)).toBe("");
        expect(toCsvField(undefined)).toBe("");
    });

    it("envolve em aspas quando o campo contém vírgula", () => {
        expect(toCsvField("Silva, João")).toBe('"Silva, João"');
    });

    it("envolve em aspas e duplica aspas internas", () => {
        expect(toCsvField('Ele disse "oi"')).toBe('"Ele disse ""oi"""');
    });

    it("envolve em aspas quando o campo contém quebra de linha", () => {
        expect(toCsvField("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
        expect(toCsvField("linha 1\r\nlinha 2")).toBe('"linha 1\r\nlinha 2"');
    });

    it("string vazia continua vazia, sem aspas", () => {
        expect(toCsvField("")).toBe("");
    });
});

describe("toCsvRow", () => {
    it("junta os campos com vírgula e termina com \\r\\n", () => {
        expect(toCsvRow(["a", "b", 1, true])).toBe("a,b,1,true\r\n");
    });

    it("escapa cada campo independentemente", () => {
        expect(toCsvRow(["Silva, João", "sem problema", null])).toBe('"Silva, João",sem problema,\r\n');
    });
});
