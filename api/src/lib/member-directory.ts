import { type TecMember, TEC_MEMBER_SELECT, TecMemberSchema } from "shared";

import { MemberDirectoryUnavailableError } from "../core/errors/auth-errors";
import { logger } from "./logger";

/** Banco da tec (Supabase) — consultado só em `POST /auth/register`, nunca escrito (FEAT-0003, seção 11). */
export interface MemberDirectory {
    /**
     * Devolve o membro, ou `null` se o email não existe (E2). Lança
     * `MemberDirectoryUnavailableError` quando o diretório não pôde ser
     * consultado (E5) — "não é membro" e "não sei se é membro" precisam de
     * respostas diferentes.
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
        // `ilike` e não `eq`: TEXT em Postgres é case-sensitive.
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
            logger.error("member_directory.request_failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            throw new MemberDirectoryUnavailableError();
        }

        if (!response.ok) {
            // Inclui 4xx: uma service_role key errada não pode virar "você não é membro".
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

        const parsed = TecMemberSchema.safeParse(payload[0]);
        if (!parsed.success) {
            // Problema de integração, não do membro — cai em E5, e o log aponta a causa.
            logger.error("member_directory.parse_failed", {
                issues: parsed.error.issues.map((issue) => issue.path.join(".")),
            });
            throw new MemberDirectoryUnavailableError();
        }

        return parsed.data;
    }
}
