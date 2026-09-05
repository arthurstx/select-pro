import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/max";
import { z } from "zod";

// Telefone em formato canônico E.164 (FEAT-0006, seção 8.2).
//
// Usa `libphonenumber-js/max` (port da libphonenumber do Google). A metadata
// `max` é a estrita: além do formato, ela conhece as regras reais do plano de
// numeração brasileiro. A diferença é concreta — `min` aceita `11111111111`,
// `71888887777` (celular que não começa com 9) e até `988887777` (sem DDD);
// `max` rejeita os três. Como o telefone é o canal de contato do processo
// seletivo, validar formato sem validar número não serve.

const COUNTRY = "BR";

/** Só os dígitos — remove máscara, espaços, `+` e pontos. */
function digitsOf(input: string): string {
    return input.replace(/\D/g, "");
}

/**
 * DDD + número, sem o código do país. O `length > 11` distingue um `+55`
 * de prefixo do DDD 55 (Santa Maria/RS), que também começa com "55":
 * `5599999999` são 10 dígitos e é um número local, não um E.164 truncado.
 */
function nationalDigits(input: string): string {
    const digits = digitsOf(input);
    return digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
}

/**
 * Converte qualquer formato reconhecido para E.164 (`+55` + DDD + número),
 * ou `null` quando o número não é válido no Brasil.
 *
 * Exige DDD (10 dígitos para fixo, 11 para celular) ANTES de consultar a
 * libphonenumber: sozinha, ela aceitaria `988887777` interpretando o `98`
 * como DDD — mais permissivo que a regex que existia antes, e um telefone
 * sem DDD é inútil para contato.
 *
 * Idempotente: um valor já em E.164 volta igual.
 */
export function toE164(input: string): string | null {
    const national = nationalDigits(input);
    if (national.length !== 10 && national.length !== 11) return null;

    const parsed = parsePhoneNumberFromString(`+55${national}`);

    return parsed?.isValid() ? parsed.number : null;
}

/** `true` quando `toE164` conseguiria converter — a checagem usada na validação. */
export function isValidBrazilianPhone(input: string): boolean {
    return toE164(input) !== null;
}

/**
 * `+5571988887777` → `(71) 98888-7777`. Para exibição apenas; o valor
 * guardado e comparado é sempre o E.164.
 *
 * Devolve a entrada intacta se ela não for um número reconhecível — uma tela
 * nunca deve quebrar por causa de um telefone fora do padrão.
 */
export function formatPhone(e164: string): string {
    const parsed = parsePhoneNumberFromString(e164, COUNTRY);

    return parsed?.isValid() ? parsed.formatNational() : e164;
}

/**
 * Máscara progressiva para o campo de digitação: `719888` → `(71) 9888`.
 *
 * Formata a partir dos dígitos, não do texto cru, para apagar funcionar sem
 * a pontuação "brigar" com o cursor. Preserva um `+` inicial para quem cola
 * um número já em E.164.
 */
export function formatPhoneAsYouType(input: string): string {
    const trimmed = input.trimStart();
    const digits = digitsOf(trimmed);

    if (trimmed.startsWith("+")) {
        return new AsYouType(COUNTRY).input(`+${digits}`);
    }

    // Trava em 11 dígitos (o máximo nacional): sem isso, digitar a mais
    // faria a máscara reinterpretar o número inteiro e reescrever o campo.
    return new AsYouType(COUNTRY).input(digits.slice(0, 11));
}

/**
 * Valida e **normaliza para E.164** (FEAT-0006, seção 4.3). Único zod de
 * telefone do projeto — extraído de `candidate.schema.ts` (FEAT-0023) para
 * ser reusável pelo cadastro auto-declarado de trainee/pós-júnior.
 *
 * A normalização vive aqui, no schema, e não no service: assim front e API
 * usam exatamente o mesmo código, e a checagem prévia de duplicidade passa a
 * comparar valores canônicos. Antes disso ela errava por diferença de
 * máscara — `(71) 98888-7777` e `71988887777` eram duas linhas distintas que
 * passavam pelo `UNIQUE`.
 *
 * Não há mais regex de formato: `toE164` usa `libphonenumber-js/max`, que
 * cobre tudo que a regex cobria e mais o que ela não tinha como saber — DDD
 * inexistente, celular que não começa com 9, número repetido. A regex antiga
 * aceitava `(00) 00000-0000`.
 *
 * O `transform` é idempotente: o E.164 que sai daqui é aceito de volta na
 * entrada, então a API revalidar o que o front já normalizou é no-op.
 */
export const PhoneSchema = z.string().transform((value, ctx) => {
    const normalized = toE164(value);

    if (!normalized) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Informe um telefone válido com DDD",
        });
        return z.NEVER;
    }

    return normalized;
});
