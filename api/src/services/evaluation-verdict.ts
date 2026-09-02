import type { EvaluationColor, EvaluationVerdict } from "shared";

/** FR-006 — D2 (veto vermelho, imediato) sempre antes de D6 (mínimo de 2), research.md D-tech4. */
export function computeVerdict(colors: EvaluationColor[]): EvaluationVerdict {
    if (colors.some((color) => color === "RED")) return "reprovado";
    if (colors.length < 2) return "pendente";
    return "aprovado";
}
