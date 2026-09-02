// Escapamento CSV (RFC 4180), isolado do domínio de export para poder ser
// testado sem tocar em D1 (FEAT-0016, `api/test/lib/csv.test.ts`).
//
// Sem lib de terceiro: um campo só precisa de aspas quando contém `,`, `"`,
// `\r` ou `\n` — cobrir isso é a regra inteira, e trazer dependência para
// isto seria peso desnecessário no orçamento de CPU do Worker (Princípio IV).

/** `null`/`undefined` viram string vazia — nunca a literal `"null"` no arquivo. */
export function toCsvField(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined) return "";

    const raw = String(value);
    const needsQuoting = /[",\r\n]/.test(raw);
    if (!needsQuoting) return raw;

    return `"${raw.replace(/"/g, '""')}"`;
}

/** Uma linha do CSV, já com o terminador `\r\n` exigido pela RFC 4180. */
export function toCsvRow(fields: readonly (string | number | boolean | null | undefined)[]): string {
    return `${fields.map(toCsvField).join(",")}\r\n`;
}
