/**
 * base64url (RFC 4648 §5) sobre `Uint8Array`.
 *
 * O runtime dos Workers tem `btoa`/`atob`, mas os dois falam base64 padrão
 * (com `+`, `/` e `=`). O hash de senha e o refresh token viajam em contextos
 * onde esses três caracteres atrapalham — o hash usa `$` como separador e o
 * token vai em cookie e em query string de URL —, então a conversão para o
 * alfabeto url-safe fica isolada aqui em vez de repetida em cada chamador.
 */

export function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Devolve `null` para entrada malformada — o chamador decide o que isso significa. */
export function fromBase64Url(value: string): Uint8Array | null {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

    try {
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return null;
    }
}
