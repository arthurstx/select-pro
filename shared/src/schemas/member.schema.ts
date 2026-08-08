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

/** O que `ELIGIBLE_MEMBER_STATUSES` libera hoje. Derivado, nunca escrito à mão. */
export type EligibleMemberStatus = (typeof ELIGIBLE_MEMBER_STATUSES)[number];

/**
 * Decide a elegibilidade a partir do valor **cru** vindo da Supabase.
 *
 * Recebe `string | null` (e não `MemberStatus`) de propósito: a coluna é TEXT
 * livre **e nullable** na origem, então tanto um valor fora do enum quanto a
 * ausência de valor são possíveis. A resposta correta para os dois é "não
 * elegível" — nunca um erro de parsing. Ver o comentário de `status` em
 * `TecMemberSchema`.
 *
 * É um type predicate para que o `null` desapareça do tipo depois da checagem:
 * quem passou por aqui pode gravar o status no snapshot sem um non-null
 * assertion que esconderia justamente o caso que importa.
 */
export function isEligibleMemberStatus(
    status: string | null,
): status is EligibleMemberStatus {
    return (
        status !== null &&
        (ELIGIBLE_MEMBER_STATUSES as readonly string[]).includes(status)
    );
}

/**
 * Shape de uma linha de `members` na resposta do PostgREST.
 *
 * Serve para **validar entrada não confiável**: é resposta de um sistema
 * externo, não um payload nosso.
 */
export const TecMemberSchema = z.object({
    /**
     * `uuid` na origem (confirmado no schema de produção), e por isso `string`
     * e não `number`. É o que `member_profiles.member_id` guarda — a migration
     * 0005 já nasceu TEXT.
     *
     * Estrito porque a coluna é do tipo `uuid` no Postgres da tec: ela não tem
     * como devolver outra coisa, e um valor fora do formato significaria que
     * estamos lendo uma tabela diferente da que este contrato descreve.
     */
    id: z.string().uuid(),

    /** Alias de `name` na origem — ver `TEC_MEMBER_SELECT`. */
    full_name: z.string(),
    email: z.string(),
    phone: z.string(),

    /** Alias de `birth_data` na origem — ver `TEC_MEMBER_SELECT`. */
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
     *
     * `nullable` pelo mesmo motivo: a coluna é NULLABLE em produção, e um
     * membro sem status precisa cair em E3 (403) como qualquer outro valor não
     * elegível — não em E5.
     */
    status: z.string().nullable(),

    manager: z.boolean(),
    created_at: z.string(),

    /**
     * Alias de `update_at` na origem (ver `TEC_MEMBER_SELECT`), e nullable:
     * linha nunca editada vem sem valor.
     */
    updated_at: z.string().nullable(),
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
    // Três colunas da tec têm nome diferente do nosso, duas delas por typo na
    // origem (`birth_data`, `update_at`). A sintaxe `nosso:deles` do PostgREST
    // renomeia na resposta, o que mantém a tradução **aqui**, no único ponto
    // que fala com a tec, em vez de espalhar os nomes deles por
    // `member_profiles`, pelo service e pelo `/auth/me`.
    //
    // Sem isto o PostgREST devolve 400 ("column does not exist") e o cadastro
    // vira E5 (503) para todo mundo — a coluna que não existe é nossa, não do
    // membro. Renomear na tec seria o conserto de verdade, mas é banco de
    // outro time e a aplicação não pode depender disso para funcionar.
    "full_name:name",
    "email",
    "phone",
    "birth_date:birth_data",
    "course",
    "semester",
    "gender",
    "ethnicity",
    "status",
    "manager",
    "created_at",
    "updated_at:update_at",
].join(",");
