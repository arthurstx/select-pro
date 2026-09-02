import { toBase64Url } from "./base64url";

// Tokens opacos (refresh token, token de recuperação de senha) — não são
// JWT de propósito: são validados contra o banco a cada uso.

/** 32 bytes = 256 bits. */
const TOKEN_BYTES = 32;

export function generateOpaqueToken(): string {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/**
 * SHA-256 em hex — o que vai para o banco. Sem KDF caro: um token de 256
 * bits aleatórios não é adivinhável, então o hash só precisa impedir que um
 * dump do D1 vire acesso direto às contas.
 */
export async function hashOpaqueToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
