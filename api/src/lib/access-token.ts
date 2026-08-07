import { verify } from "hono/jwt";
import { JwtTokenExpired } from "hono/utils/jwt/types";
import { SignJWT } from "jose";

/**
 * Access token (JWT HS256) — FEAT-0003, seção 9.
 *
 * Assinado com `jose` (já era dependência do `api/`, usada no FEAT-0002) e
 * verificado com `hono/jwt`, que é quem distingue "expirado" de "inválido"
 * através de classes de erro — distinção que é requisito funcional aqui
 * (E11) e não detalhe de implementação.
 *
 * HS256 e não RS256/EdDSA porque emissor e verificador são o mesmo Worker:
 * assimetria só traria gestão de par de chaves sem nenhum terceiro para
 * verificar a assinatura.
 */

/**
 * 15 minutos. O access token é stateless — não há como revogá-lo antes de
 * expirar —, então este número é a janela de exposição aceita em troca de não
 * consultar o banco a cada requisição.
 *
 * Vai no corpo da resposta como `expiresIn`, em segundos.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

/**
 * Conteúdo do access token.
 *
 * Fica em `api/` e não em `shared/` porque não é contrato entre front e back:
 * para o front o token é uma string opaca que ele repassa em `Authorization`.
 * Quem lê estes claims é o middleware deste mesmo Worker. O que o front
 * consome de identidade vem do envelope de `/auth/me` e de `AuthUserSchema`,
 * esses sim em `shared`.
 */
export interface AccessTokenClaims {
    /** `users.id`. */
    sub: string;
    email: string;
    /** `roles.value` — `"avaliador"` em todo cadastro; `"admin"` só por promoção manual. */
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
 * Verifica assinatura e expiração.
 *
 * O retorno separa `expired` de `invalid` porque o front reage de formas
 * opostas aos dois: expirado significa "chame /auth/refresh e repita a
 * requisição" (acontece a cada 15 minutos, é rotina), inválido significa "a
 * sessão acabou, vá para o login". Colapsar os dois num 401 genérico
 * deslogaria o usuário a cada quarto de hora (FEAT-0003, seção 5).
 *
 * Qualquer outra falha — assinatura trocada, algoritmo diferente, JSON
 * quebrado, claim faltando — cai em `invalid`. Não há terceiro caso útil: se
 * não dá para confiar no token, a sessão acabou.
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

    // Um token assinado por nós sempre tem os cinco claims. Se algum faltar, ou
    // ele foi emitido por uma versão incompatível ou não é nosso — nos dois
    // casos a resposta é a mesma que para assinatura inválida.
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
