/**
 * D1 (SQLite) não expõe um nome de constraint estruturado no erro — a
 * violação de UNIQUE chega como mensagem de texto, tipicamente no formato
 * "UNIQUE constraint failed: <tabela>.<coluna>". Diferente de Postgres,
 * essa inspeção precisa fazer parsing da string, não ler um código
 * estruturado — por isso essa lógica fica isolada aqui, e não espalhada
 * pelo repository/service (ver prompt de implementação, seção 5, nota técnica).
 */

const UNIQUE_CONSTRAINT_PATTERN = /UNIQUE constraint failed: candidates\.(\w+)/;
const ANY_UNIQUE_CONSTRAINT_PATTERN = /UNIQUE constraint failed: (\w+)\.(\w+)/;

export type CandidateUniqueField = "email" | "phone";

export interface UniqueConstraintViolation {
    table: string;
    column: string;
}

/**
 * Versão genérica da inspeção acima: devolve tabela e coluna de qualquer
 * violação de UNIQUE, ou `null` se o erro for outra coisa.
 *
 * Existe porque o cadastro de membro (FEAT-0003) grava em três tabelas no mesmo
 * batch e precisa distinguir qual constraint estourou: `users.email` é E1/E6
 * ("já existe conta com este email"), enquanto `member_profiles.member_id`
 * significa que aquele membro já criou conta com **outro** email — mesma
 * família de conflito, causa diferente, e só o log distingue as duas.
 */
export function parseUniqueConstraint(error: unknown): UniqueConstraintViolation | null {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(ANY_UNIQUE_CONSTRAINT_PATTERN);
    if (!match) return null;

    return { table: match[1], column: match[2] };
}

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
