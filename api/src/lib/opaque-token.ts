import { toBase64Url } from "./base64url";

/**
 * Tokens opacos: refresh token (`sessions`) e token de recuperação de senha
 * (`password_reset_tokens`).
 *
 * Nenhum dos dois é JWT, de propósito (FEAT-0003, seção 9): os dois são
 * validados contra o banco a cada uso, então assiná-los não acrescentaria
 * nada e só exporia claims sem necessidade.
 */

/** 32 bytes = 256 bits. Longe do alcance de força bruta, ao contrário de uma senha. */
const TOKEN_BYTES = 32;

export function generateOpaqueToken(): string {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/**
 * SHA-256 em hex — o que vai para o banco. O token em claro só existe no
 * cookie do membro (refresh) ou no email dele (recuperação).
 *
 * Sem KDF caro aqui, e isso não é descuido: PBKDF2 existe para tornar cara a
 * adivinhação de segredos de baixa entropia. Um token de 256 bits aleatórios
 * não é adivinhável, então o hash só precisa impedir que um dump do D1 vire
 * acesso direto às contas — e SHA-256 faz exatamente isso, de graça em CPU
 * (o que importa dentro do teto de 10 ms).
 */
export async function hashOpaqueToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
