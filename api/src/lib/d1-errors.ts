// D1 (SQLite) não expõe nome de constraint estruturado — a violação de
// UNIQUE chega como texto ("UNIQUE constraint failed: <tabela>.<coluna>").

const UNIQUE_CONSTRAINT_PATTERN = /UNIQUE constraint failed: candidates\.(\w+)/;
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

/** Coluna única de `candidates` que causou a falha, ou `null` se não for essa constraint. */
export function parseD1ConstraintError(error: unknown): CandidateUniqueField | null {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(UNIQUE_CONSTRAINT_PATTERN);
    if (!match) return null;

    const column = match[1];
    if (column === "email" || column === "phone") return column;
    return null;
}
