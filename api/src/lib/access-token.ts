import { verify } from "hono/jwt";
import { JwtTokenExpired } from "hono/utils/jwt/types";
import { SignJWT } from "jose";

// Access token (JWT HS256) — FEAT-0003, seção 9. HS256 porque emissor e
// verificador são o mesmo Worker.

/** 15 minutos — janela de exposição aceita por não revogar antes da expiração (token stateless). */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

/** Fica em `api/`, não em `shared/`: o front trata o token como string opaca. */
export interface AccessTokenClaims {
    /** `users.id`. */
    sub: string;
    email: string;
    /** `roles.value`. */
    role: string;
    /** `sessions.id` que originou este token. */
    sid: string;
    iat: number;
    exp: number;
}

export async function signAccessToken(
    claims: Omit<AccessTokenClaims, "iat" | "exp">,
    secret: string,
    ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1000);

    return new SignJWT({ email: claims.email, role: claims.role, sid: claims.sid })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(claims.sub)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ttlSeconds)
        .sign(new TextEncoder().encode(secret));
}

export type AccessTokenFailure = "expired" | "invalid";

export type AccessTokenVerification =
    | { ok: true; claims: AccessTokenClaims }
    | { ok: false; reason: AccessTokenFailure };

/**
 * `expired` vs `invalid`: o front renova e repete no primeiro caso, manda
 * para o login no segundo (FEAT-0003, seção 5).
 */
export async function verifyAccessToken(
    token: string,
    secret: string,
): Promise<AccessTokenVerification> {
    let payload: Record<string, unknown>;

    try {
        payload = (await verify(token, secret, { alg: "HS256" })) as Record<string, unknown>;
    } catch (err) {
        return { ok: false, reason: err instanceof JwtTokenExpired ? "expired" : "invalid" };
    }

    const { sub, email, role, sid, iat, exp } = payload;

    if (
        typeof sub !== "string" ||
        typeof email !== "string" ||
        typeof role !== "string" ||
        typeof sid !== "string" ||
        typeof iat !== "number" ||
        typeof exp !== "number"
    ) {
        return { ok: false, reason: "invalid" };
    }

    return { ok: true, claims: { sub, email, role, sid, iat, exp } };
}
