import { fromBase64Url, toBase64Url } from "./base64url";

/**
 * Derivação e verificação de senha (FEAT-0003, seção 9).
 *
 * PBKDF2-SHA256 via WebCrypto porque é o único KDF nativo do runtime dos
 * Workers: bcrypt, scrypt e argon2 só existiriam como WASM, e o custo em
 * bundle size vira cold start.
 */

/**
 * Iterações do PBKDF2 usadas em toda derivação nova.
 *
 * ⚠️ ESTE NÚMERO PRECISA SER CALIBRADO MEDINDO NO WORKER EM PRODUÇÃO.
 *
 * O plano Free dá 10 ms de CPU por invocação, e a derivação da senha é o
 * único trecho de CPU pura de todo o fluxo de auth (o resto é I/O, que não
 * consome o orçamento). O alvo da spec é ~5 ms só para a derivação, metade do
 * teto, deixando folga para parsing, D1 e serialização.
 *
 * 25.000 é o ponto de partida, não uma medição: `wrangler dev` não aplica o
 * teto de produção, então o número real só aparece no painel da Cloudflare
 * depois do deploy. Estourar o limite **não** é um problema de carga — é
 * determinístico: um valor alto demais faz TODO login falhar com `Error 1102`,
 * inclusive o primeiro. Medir e ajustar faz parte da entrega.
 *
 * Subir este valor é seguro a qualquer momento: as iterações ficam gravadas
 * dentro do hash, e o login re-deriva as contas antigas sozinho
 * (`passwordNeedsRehash`). Nenhuma migration, ninguém troca de senha.
 *
 * Para referência: o OWASP recomenda 600.000 para PBKDF2-SHA256. Estamos ~24x
 * abaixo, e isso é um risco aceito enquanto o projeto estiver no plano Free
 * (FEAT-0003, seção 13).
 */
export const PBKDF2_ITERATIONS = 25_000;

/** Identifica o algoritmo no hash persistido. Um segundo algoritmo, se existir um dia, entra como outra tag. */
const ALGORITHM_TAG = "pbkdf2-sha256";

const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;

/**
 * Salt fixo usado só na derivação de fachada de `verifyPassword` quando não há
 * hash para comparar (usuário inexistente ou sem senha). Não protege nada — o
 * resultado é descartado —, existe apenas para que o custo de CPU de um login
 * inválido seja igual ao de um válido. Sem isso, o tempo de resposta diria ao
 * atacante se o email existe, contornando a resposta idêntica de E7.
 */
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

/**
 * Comparação em tempo constante.
 *
 * `===` em string (ou um `for` com `return false` no primeiro byte diferente)
 * vaza o prefixo correto do hash: o atacante mede o tempo e descobre byte a
 * byte quanto acertou. O XOR acumulado percorre o array inteiro sempre.
 *
 * O `return` antecipado por tamanho não vaza nada de útil: o comprimento da
 * chave derivada é constante (`DERIVED_KEY_BYTES`), não é segredo.
 */
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
 * Lê o formato `pbkdf2-sha256$<iterations>$<salt_b64url>$<hash_b64url>`.
 *
 * As iterações moram DENTRO do hash de propósito: é o que permite elevá-las
 * depois sem migration e sem forçar ninguém a trocar de senha. Cada linha
 * carrega o parâmetro com que foi gerada, então hashes de custos diferentes
 * coexistem na tabela sem ambiguidade.
 *
 * Devolve `null` para qualquer coisa fora do formato — inclusive um hash de um
 * algoritmo que não conhecemos. Quem chama trata isso como "senha não confere",
 * nunca como erro técnico: um hash corrompido não pode virar 500.
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

/**
 * Confere a senha contra o hash armazenado.
 *
 * Aceita `null` (usuário sem senha) e hash malformado, e nos dois casos ainda
 * paga uma derivação de fachada antes de responder `false`. É o que mantém o
 * custo de um login com email inexistente igual ao de um login legítimo — a
 * resposta de E7 já é idêntica, e o tempo também precisa ser.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
    const parsed = stored ? parsePasswordHash(stored) : null;

    if (!parsed) {
        await deriveBits(password, DUMMY_SALT, PBKDF2_ITERATIONS);
        return false;
    }

    const derived = await deriveBits(password, parsed.salt, parsed.iterations);
    return timingSafeEqual(derived, parsed.hash);
}

/**
 * O hash foi gerado com menos iterações do que as de hoje?
 *
 * Chamado após um login bem-sucedido: se `true`, o service re-deriva e regrava,
 * e aquela conta passa a valer o custo atual sem que o membro perceba.
 *
 * Um hash ilegível responde `false` de propósito. Ele não é "fraco", é
 * inválido — a senha nunca vai conferir contra ele, e o caminho de re-hash
 * (que só roda depois de a senha conferir) jamais é alcançado.
 */
export function passwordNeedsRehash(stored: string): boolean {
    const parsed = parsePasswordHash(stored);
    if (!parsed) return false;

    return parsed.iterations < PBKDF2_ITERATIONS;
}
