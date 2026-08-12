import type { TecMember } from "shared";

import type { MemberDirectory } from "./member-directory";

/**
 * Substitui a Supabase durante `wrangler dev` local. Qualquer email vira
 * membro ativo e elegível — sem isso, criar uma conta local exigiria uma
 * linha de verdade no banco da tec (produção ou staging), que quem só quer
 * rodar o projeto na própria máquina não tem acesso, e não deveria precisar.
 *
 * Só entra em cena via `MEMBER_DIRECTORY_BYPASS=true` em `.dev.vars`
 * (ver `auth.routes.ts`, `buildMemberDirectory`). O wrangler nunca aplica
 * `.dev.vars` a `wrangler deploy` — nem staging nem produção correm o risco
 * de pular a checagem real por causa disto.
 */
export class LocalMemberDirectory implements MemberDirectory {
    async findByEmail(email: string): Promise<TecMember | null> {
        const now = new Date().toISOString();

        return {
            id: crypto.randomUUID(),
            full_name: nameFromEmail(email),
            email,
            phone: "71999999999",
            birth_date: null,
            course: "Engenharia de Computação",
            semester: 5,
            gender: "Não informado",
            ethnicity: "Não informado",
            status: "active",
            manager: false,
            created_at: now,
            updated_at: null,
        };
    }
}

/** "ana.silveira@x.com" -> "Ana Silveira" — só para o cadastro local ter um nome legível. */
function nameFromEmail(email: string): string {
    const localPart = email.split("@")[0] ?? "";
    const words = localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((word) => word[0]!.toUpperCase() + word.slice(1));

    return words.length > 0 ? words.join(" ") : "Membro Local";
}
