import { fromBase64Url, toBase64Url } from "./base64url";

// PBKDF2-SHA256 via WebCrypto: único KDF nativo do runtime dos Workers
// (bcrypt/scrypt/argon2 só existiriam como WASM).

/**
 * ⚠️ Precisa ser calibrado medindo no Worker em produção. Ponto de partida,
 * não medição: o plano Free dá 10ms de CPU/invocação e um valor alto demais
 * faz todo login falhar com `Error 1102`. Seguro subir depois — as
 * iterações ficam gravadas no hash e o login re-deriva sozinho
 * (`passwordNeedsRehash`). OWASP recomenda 600.000; ~24x abaixo é risco
 * aceito no plano Free (FEAT-0003, seção 13).
 */
export const PBKDF2_ITERATIONS = 25_000;

const ALGORITHM_TAG = "pbkdf2-sha256";
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;

/** Salt de fachada para `verifyPassword` sem hash real, para igualar o custo de CPU e não vazar E7 por timing. */
const DUMMY_SALT = new Uint8Array([
    0x9f, 0x1c, 0x4a, 0x77, 0x2e, 0xb3, 0x05, 0xd8, 0x61, 0x0f, 0xc4, 0x93, 0x2a, 0x7e, 0xd1, 0x58,
]);

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
    );

    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations },
        keyMaterial,
        DERIVED_KEY_BYTES * 8,
    );

    return new Uint8Array(bits);
}

/** Tempo constante: um `===`/`for` com early-return vazaria o hash byte a byte por timing. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;

    let difference = 0;
    for (let i = 0; i < a.length; i += 1) {
        difference |= a[i] ^ b[i];
    }

    return difference === 0;
}

interface ParsedPasswordHash {
    iterations: number;
    salt: Uint8Array;
    hash: Uint8Array;
}

/**
 * Lê `pbkdf2-sha256$<iterations>$<salt_b64url>$<hash_b64url>`. `null` para
 * qualquer coisa fora do formato — quem chama trata como "senha não
 * confere", nunca como erro técnico.
 */
export function parsePasswordHash(stored: string): ParsedPasswordHash | null {
    const parts = stored.split("$");
    if (parts.length !== 4) return null;

    const [tag, rawIterations, rawSalt, rawHash] = parts;
    if (tag !== ALGORITHM_TAG) return null;

    const iterations = Number(rawIterations);
    if (!Number.isInteger(iterations) || iterations <= 0) return null;

    const salt = fromBase64Url(rawSalt);
    const hash = fromBase64Url(rawHash);
    if (!salt || !hash || salt.length === 0 || hash.length === 0) return null;

    return { iterations, salt, hash };
}

/** Deriva um hash novo, com salt aleatório por usuário. */
export async function hashPassword(
    password: string,
    iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const derived = await deriveBits(password, salt, iterations);

    return [ALGORITHM_TAG, iterations, toBase64Url(salt), toBase64Url(derived)].join("$");
}

/** Aceita `null`/hash malformado e ainda paga a derivação de fachada, para igualar o tempo de resposta ao de E7. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
    const parsed = stored ? parsePasswordHash(stored) : null;

    if (!parsed) {
        await deriveBits(password, DUMMY_SALT, PBKDF2_ITERATIONS);
        return false;
    }

    const derived = await deriveBits(password, parsed.salt, parsed.iterations);
    return timingSafeEqual(derived, parsed.hash);
}

/** `true` se o hash foi gerado com menos iterações que as de hoje — o service re-deriva após login bem-sucedido. */
export function passwordNeedsRehash(stored: string): boolean {
    const parsed = parsePasswordHash(stored);
    if (!parsed) return false;

    return parsed.iterations < PBKDF2_ITERATIONS;
}
