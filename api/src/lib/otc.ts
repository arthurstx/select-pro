/**
 * Gera um código OTC de 6 dígitos numéricos (FEAT-0001 seção 9, decisão #3
 * do prompt de implementação). Usa crypto.getRandomValues (disponível no
 * runtime do Workers) em vez de Math.random para evitar previsibilidade.
 */
export function generateOtcCode(): string {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const code = buffer[0] % 1_000_000;
    return code.toString().padStart(6, "0");
}

/** SHA-256 do código em hex — nunca armazenar o código em texto plano (FEAT-0001 seção 8.1). */
export async function hashOtcCode(code: string): Promise<string> {
    const data = new TextEncoder().encode(code);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

/** Comparação em tempo constante — os hashes SHA-256 em hex têm sempre o mesmo tamanho (64 chars). */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}

export async function verifyOtcCode(code: string, codeHash: string): Promise<boolean> {
    const candidateHash = await hashOtcCode(code);
    return timingSafeEqual(candidateHash, codeHash);
}
