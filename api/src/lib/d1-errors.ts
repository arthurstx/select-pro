/**
 * D1 (SQLite) não expõe um nome de constraint estruturado no erro — a
 * violação de UNIQUE chega como mensagem de texto, tipicamente no formato
 * "UNIQUE constraint failed: <tabela>.<coluna>". Diferente de Postgres,
 * essa inspeção precisa fazer parsing da string, não ler um código
 * estruturado — por isso essa lógica fica isolada aqui, e não espalhada
 * pelo repository/service (ver prompt de implementação, seção 5, nota técnica).
 */

const UNIQUE_CONSTRAINT_PATTERN = /UNIQUE constraint failed: candidates\.(\w+)/;

export type CandidateUniqueField = "email" | "phone";

/**
 * Retorna qual coluna única de `candidates` causou a falha, ou `null` se o
 * erro não for uma violação de UNIQUE reconhecida nessa tabela (nesse caso,
 * o chamador deve deixar o erro subir — é uma falha técnica, não um E10).
 */
export function parseD1ConstraintError(error: unknown): CandidateUniqueField | null {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(UNIQUE_CONSTRAINT_PATTERN);
    if (!match) return null;

    const column = match[1];
    if (column === "email" || column === "phone") return column;
    return null;
}
