import { describe, expect, it } from "vitest";

import { computeVerdict } from "../src/services/evaluation-verdict";

// Testes unitários puros (research.md D-tech4) — D2 sempre antes de D6.

describe("computeVerdict", () => {
    it("0 avaliações: pendente", () => {
        expect(computeVerdict([])).toBe("pendente");
    });

    it("1 avaliação verde: ainda pendente (D6, mínimo 2)", () => {
        expect(computeVerdict(["GREEN"])).toBe("pendente");
    });

    it("2 avaliações, nenhuma vermelha: aprovado", () => {
        expect(computeVerdict(["GREEN", "YELLOW"])).toBe("aprovado");
    });

    it("1 avaliação vermelha isolada: reprovado, mesmo sem atingir o mínimo de 2 (D2 não espera D6)", () => {
        expect(computeVerdict(["RED"])).toBe("reprovado");
    });

    it("1 vermelha entre várias verdes: reprovado (D2, veto — não importa quantas no total)", () => {
        expect(computeVerdict(["GREEN", "GREEN", "RED"])).toBe("reprovado");
    });

    it("3 avaliações sem nenhuma vermelha: aprovado", () => {
        expect(computeVerdict(["GREEN", "YELLOW", "GREEN"])).toBe("aprovado");
    });
});
