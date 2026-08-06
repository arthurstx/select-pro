import { z } from "zod";

import type { MemberStatus } from "./database.schema";

// ============================================================
// Membro da CIMATEC jr, como ele existe no banco da tec (Supabase).
//
// Este arquivo é o ÚNICO acoplamento da aplicação ao schema de um sistema
// que não controlamos. Tudo aqui descreve a tabela `members` de lá — não uma
// tabela nossa. Ver FEAT-0003, seção 8.1.
// ============================================================

/**
 * Os status que a tec usa hoje. Para acrescentar um novo (`suspended`, por
 * exemplo), basta incluí-lo aqui — e, se ele também puder criar conta, em
 * `ELIGIBLE_MEMBER_STATUSES`.
 *
 * ⚠️ Este enum documenta os valores **esperados**, não os **garantidos**: a
 * coluna `status` é TEXT livre no Postgres da tec, sem CHECK (confirmado com
 * quem administra a base). A aplicação é a única barreira.
 */
export const MemberStatusSchema = z.enum([
    "active",
    "inactive",
    "alumni",
    "on_leave",
]) satisfies z.ZodType<MemberStatus>;

/**
 * Quem pode criar conta na aplicação.
 *
 * É uma lista — e não uma comparação com `"active"` — porque esta é a regra
 * do FEAT-0003 com maior chance de mudar, e mudá-la precisa custar uma linha.
 * `on_leave` (afastado) e `alumni` (ex-membro) estão de fora nesta versão: a
 * empresa às vezes os convoca para o processo seletivo, mas ainda não existe
 * política para isso, e o caminho provável é um fluxo de liberação por admin,
 * não engordar esta lista (FEAT-0003, seção 10, pergunta 3).
 *
 * A ordem importa: liberar depois quem foi barrado é editar esta constante;
 * revogar acesso já concedido exige achar e desativar contas uma a uma.
 */
export const ELIGIBLE_MEMBER_STATUSES = ["active"] as const satisfies readonly MemberStatus[];

/**
 * Decide a elegibilidade a partir do valor **cru** vindo da Supabase.
 *
 * Recebe `string` (e não `MemberStatus`) de propósito: um valor fora do enum
 * é possível na origem, e a resposta correta para ele é "não elegível" — nunca
 * um erro de parsing. Ver o comentário de `status` em `TecMemberSchema`.
 */
export function isEligibleMemberStatus(status: string): boolean {
    return (ELIGIBLE_MEMBER_STATUSES as readonly string[]).includes(status);
}

/**
 * Shape de uma linha de `members` na resposta do PostgREST.
 *
 * Serve para **validar entrada não confiável**: é resposta de um sistema
 * externo, não um payload nosso.
 */
export const TecMemberSchema = z.object({
    id: z.number().int(),
    full_name: z.string(),
    email: z.string(),
    phone: z.string(),
    birth_date: z.string().nullable(),

    /**
     * `course`, `gender` e `ethnicity` são TEXT livre na origem e **não**
     * correspondem aos enums da aplicação (`"Engenharia de Computação"` lá vs.
     * `"eng-computacao"` aqui). Ficam como string crua de propósito: aplicar
     * nossos enums a dados de um sistema que não controlamos faria o cadastro
     * falhar por um valor que o membro não tem como corrigir.
     */
    course: z.string(),
    semester: z.number().int(),
    gender: z.string(),
    ethnicity: z.string(),

    /**
     * Cru, como veio — **não** é `MemberStatusSchema` aqui, e isso é
     * deliberado. Se este campo fosse estrito, um status novo criado na tec
     * derrubaria o parse do membro inteiro, e o cadastro responderia 503
     * ("tente novamente") em vez de 403 ("você não é elegível") — a mensagem
     * errada para um problema que nenhuma nova tentativa resolve.
     * A decisão de elegibilidade fica em `isEligibleMemberStatus`.
     */
    status: z.string(),

    manager: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type TecMember = z.infer<typeof TecMemberSchema>;

/**
 * Colunas pedidas ao PostgREST (`?select=...`). Explicitar em vez de usar `*`
 * mantém o contrato visível: se a tec adicionar uma coluna, nada muda aqui
 * sozinho, e se remover uma que usamos, o parse falha alto em vez de gravar
 * `undefined` no snapshot.
 */
export const TEC_MEMBER_SELECT = [
    "id",
    "full_name",
    "email",
    "phone",
    "birth_date",
    "course",
    "semester",
    "gender",
    "ethnicity",
    "status",
    "manager",
    "created_at",
    "updated_at",
].join(",");
