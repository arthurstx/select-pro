import { type TecMember, TEC_MEMBER_SELECT, TecMemberSchema } from "shared";

import { MemberDirectoryUnavailableError } from "../core/errors/auth-errors";
import { logger } from "./logger";

/**
 * Banco da tec (Supabase) — a fonte da verdade sobre quem é membro.
 *
 * Consultado **apenas** em `POST /auth/register` e **nunca** escrito
 * (FEAT-0003, seção 11). O login não passa por aqui de propósito: uma
 * indisponibilidade da Supabase impede cadastros novos, mas não pode derrubar
 * quem já tem conta.
 */
export interface MemberDirectory {
    /**
     * Devolve o membro, ou `null` se o email não existe lá (E2).
     *
     * Lança `MemberDirectoryUnavailableError` quando o diretório não pôde ser
     * consultado (E5). A distinção é o coração do fail-closed: "não é membro" e
     * "não sei se é membro" levam a respostas diferentes, e confundir as duas
     * criaria conta indevida ou barraria membro legítimo.
     */
    findByEmail(email: string): Promise<TecMember | null>;
}

/** A spec fixa 3s: uma Supabase lenta não pode segurar a requisição do membro. */
const REQUEST_TIMEOUT_MS = 3000;

export class SupabaseMemberDirectory implements MemberDirectory {
    constructor(
        private readonly baseUrl: string,
        private readonly serviceRoleKey: string,
    ) {}

    async findByEmail(email: string): Promise<TecMember | null> {
        // `ilike` e não `eq`: TEXT em Postgres é case-sensitive, então um membro
        // gravado como `Fulano@…` seria invisível para quem digita `fulano@…` e
        // um membro legítimo levaria E2 ("não é membro"). Sem `*` no valor, o
        // `ilike` do PostgREST compara a string inteira — não é busca parcial.
        const url =
            `${this.baseUrl.replace(/\/$/, "")}/rest/v1/members` +
            `?email=ilike.${encodeURIComponent(email)}` +
            `&select=${encodeURIComponent(TEC_MEMBER_SELECT)}` +
            `&limit=1`;

        let response: Response;
        try {
            response = await fetch(url, {
                headers: {
                    apikey: this.serviceRoleKey,
                    Authorization: `Bearer ${this.serviceRoleKey}`,
                    Accept: "application/json",
                },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (err) {
            // Timeout (`AbortSignal.timeout`) e erro de rede chegam os dois aqui.
            logger.error("member_directory.request_failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            throw new MemberDirectoryUnavailableError();
        }

        if (!response.ok) {
            // Inclui 4xx: uma service_role key errada devolve 401, e responder
            // "você não é membro" a um erro de configuração nosso seria mentir
            // para o membro sobre um problema que ele não pode resolver.
            logger.error("member_directory.non_2xx", { status: response.status });
            throw new MemberDirectoryUnavailableError();
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch (err) {
            logger.error("member_directory.invalid_json", {
                error: err instanceof Error ? err.message : String(err),
            });
            throw new MemberDirectoryUnavailableError();
        }

        if (!Array.isArray(payload) || payload.length === 0) {
            return null; // E2 — nenhuma linha para este email
        }

        // Entrada não confiável: é a resposta de um sistema que não controlamos.
        const parsed = TecMemberSchema.safeParse(payload[0]);
        if (!parsed.success) {
            // Não é E2 nem E3. Se a tec removeu ou renomeou uma coluna que
            // usamos, não dá para montar o snapshot — e gravar `undefined` no
            // perfil seria pior que falhar. Cai em E5 porque é problema de
            // integração, não do membro; o log é o que aponta para o culpado.
            logger.error("member_directory.parse_failed", {
                issues: parsed.error.issues.map((issue) => issue.path.join(".")),
            });
            throw new MemberDirectoryUnavailableError();
        }

        return parsed.data;
    }
}
