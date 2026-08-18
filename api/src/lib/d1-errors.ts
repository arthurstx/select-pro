// D1 (SQLite) não expõe nome de constraint estruturado — a violação de
// UNIQUE chega como texto ("UNIQUE constraint failed: <tabela>.<coluna>").

// Desde a FEAT-0006 a unicidade de `candidates` é composta — o SQLite
// reporta "UNIQUE constraint failed: candidates.process_id, candidates.email".
// Casar só o primeiro par (como a versão anterior fazia) devolveria
// `process_id` como campo em conflito, e o candidato receberia um 409
// apontando para um campo que ele nem preencheu.
const CANDIDATE_UNIQUE_FIELDS_PATTERN = /UNIQUE constraint failed: ((?:candidates\.\w+(?:,\s*)?)+)/;
const ANY_UNIQUE_CONSTRAINT_PATTERN = /UNIQUE constraint failed: (\w+)\.(\w+)/;

export type CandidateUniqueField = "email" | "phone";

export interface UniqueConstraintViolation {
    table: string;
    column: string;
}

/** Devolve tabela e coluna de qualquer violação de UNIQUE, ou `null` se o erro for outra coisa. */
export function parseUniqueConstraint(error: unknown): UniqueConstraintViolation | null {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(ANY_UNIQUE_CONSTRAINT_PATTERN);
    if (!match) return null;

    return { table: match[1], column: match[2] };
}

/**
 * Campo de `candidates` que o candidato precisa corrigir, ou `null` se o
 * erro não for essa constraint.
 *
 * Ignora `process_id` de propósito: ele faz parte da constraint composta,
 * mas não é um campo do formulário — o que interessa reportar é o email ou
 * o telefone, que é o que a pessoa consegue mudar.
 */
export function parseD1ConstraintError(error: unknown): CandidateUniqueField | null {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(CANDIDATE_UNIQUE_FIELDS_PATTERN);
    if (!match) return null;

    const columns = match[1].split(",").map((entry) => entry.trim().replace("candidates.", ""));

    if (columns.includes("email")) return "email";
    if (columns.includes("phone")) return "phone";
    return null;
}
