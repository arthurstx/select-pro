// Telefone em formato canônico E.164 (FEAT-0006, seção 8.2).
//
// Antes desta feature não havia normalização nenhuma: a regex de validação
// aceitava máscara, e a comparação (`findByPhone`, constraint UNIQUE) era de
// string exata — então `(71) 98888-7777` e `71988887777` conviviam no banco
// como duas linhas distintas. Estas duas funções são a única fonte da regra,
// usadas pelo front e pela API através do schema Zod.

/** Só os dígitos — remove máscara, espaços, `+` e pontos. */
function digitsOf(input: string): string {
    return input.replace(/\D/g, "");
}

/**
 * Converte qualquer formato reconhecido para E.164 (`+55` + DDD + número),
 * ou `null` quando não há regra para o valor.
 *
 * Aceita fixo (10 dígitos) além de celular (11) porque é o que a
 * `PHONE_REGEX` já aceitava — estreitar agora rejeitaria dados que já estão
 * no banco. Idempotente: um valor já em E.164 volta igual.
 */
export function toE164(input: string): string | null {
    const digits = digitsOf(input);

    // Já vem com código do país.
    if (digits.length === 13 && digits.startsWith("55")) return `+${digits}`;

    // Nacional, com DDD: 10 (fixo) ou 11 (celular).
    if (digits.length === 10 || digits.length === 11) return `+55${digits}`;

    return null;
}

/**
 * `+5571988887777` → `(71) 98888-7777`. Para exibição apenas; o valor
 * guardado e comparado é sempre o E.164.
 *
 * Devolve a entrada intacta se ela não estiver no formato esperado — uma
 * tela nunca deve quebrar por causa de um telefone fora do padrão.
 */
export function formatPhone(e164: string): string {
    const digits = digitsOf(e164);
    if (digits.length !== 12 && digits.length !== 13) return e164;
    if (!digits.startsWith("55")) return e164;

    const areaCode = digits.slice(2, 4);
    const subscriber = digits.slice(4);
    const middle = subscriber.length === 9 ? subscriber.slice(0, 5) : subscriber.slice(0, 4);
    const last = subscriber.slice(-4);

    return `(${areaCode}) ${middle}-${last}`;
}
