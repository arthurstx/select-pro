import { z } from "zod";

import { GenderSchema } from "./candidate.schema";
import { AttendanceSchema } from "./checkin.schema";
import { EvaluatorRoleSchema } from "./evaluator.schema";
import { MemberStatusSchema } from "./member.schema";

// Organização automática de grupos (FEAT-0012). `groups`, `group_evaluators` e
// `group_candidates` — órfãs desde `0001-schema.sql` — passam a ser usadas
// pela primeira vez aqui (data-model.md, migration 0014).

// ------------------------------------------------------------
// Responses
// ------------------------------------------------------------

export const GroupModalitySchema = z.enum(["presencial", "online"]);
export type GroupModality = z.infer<typeof GroupModalitySchema>;

/**
 * `gender` exposto aqui desde a FEAT-0021 — diferente de `CandidateCheckinItemSchema`
 * (FEAT-0005), `/groups` é INTEIRAMENTE admin-only (mesmo nível de acesso que já expõe
 * email/telefone no dashboard) e a gestão precisa ver o sexo pra revisar D1 visualmente antes
 * de aprovar uma organização (research.md da FEAT-0021, Decisão 5) — não é uma reversão da
 * postura da FEAT-0005 (aquela tela é acessível a qualquer avaliador, esta não).
 */
export const GroupCandidateSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    attendance: AttendanceSchema,
    gender: GenderSchema,
});
export type GroupCandidate = z.infer<typeof GroupCandidateSchema>;

/** `memberStatus` exposto desde a FEAT-0021 — mesmo nível de acesso já usado em `/evaluators`. */
export const GroupEvaluatorSchema = z.object({
    userId: z.string().uuid(),
    name: z.string(),
    role: EvaluatorRoleSchema,
    memberStatus: MemberStatusSchema,
});
export type GroupEvaluator = z.infer<typeof GroupEvaluatorSchema>;

/** `room: null` sempre que `modality === "online"` (FR-007) — nunca as duas coisas. */
export const GroupSummarySchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    modality: GroupModalitySchema,
    /** `size` (FEAT-0022) — alimenta `deriveRoomCapacity` no front pra diagnóstico de host/desvio do ideal, sem round-trip. */
    room: z.object({ id: z.string().uuid(), name: z.string(), size: z.number().int() }).nullable(),
    candidates: z.array(GroupCandidateSchema),
    /**
     * Populado para as duas modalidades (FEAT-0018) — a organização automática aloca
     * avaliador/host a grupos online também, pelo mesmo round-robin dos presenciais, sobre um
     * pool único (nenhum avaliador é alocado a mais de um grupo no total).
     */
    evaluators: z.array(GroupEvaluatorSchema),
});
export type GroupSummary = z.infer<typeof GroupSummarySchema>;

/** `GET /groups` e `data.groups` do `POST /groups/organize/presencial|online`. */
export const GroupListResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema),
    }),
});
export type GroupListResponse = z.infer<typeof GroupListResponseSchema>;

/**
 * FEAT-0018 — `POST /groups/online/{id}/join` e `PUT /groups/online/{id}/evaluators/{userId}`:
 * devolvem só o grupo de destino (não um par origem/destino como `MoveResultResponseSchema` —
 * pode não ter existido grupo de origem).
 */
export const GroupResponseSchema = z.object({
    data: GroupSummarySchema,
});
export type GroupResponse = z.infer<typeof GroupResponseSchema>;

/** FR-013 — só `POST /groups/organize` calcula esse número; `GET /groups` sempre devolve `0`. */
export const OrganizeResultResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema),
        unallocatedCandidateCount: z.number().int(),
    }),
});
export type OrganizeResultResponse = z.infer<typeof OrganizeResultResponseSchema>;

/**
 * FEAT-0021 — corpo de `POST /groups/organize/presencial` e `POST /groups/preview/presencial`.
 * Ausente = todos os avaliadores presentes (comportamento de antes da feature, sem mudança de
 * compatibilidade). Hosts presentes continuam sempre completos — sem seleção própria
 * (research.md, Decisão 4).
 */
export const OrganizePresencialBodySchema = z.object({
    evaluatorUserIds: z.array(z.string().uuid()).optional(),
});
export type OrganizePresencialBody = z.infer<typeof OrganizePresencialBodySchema>;

/** FEAT-0021 — avaliador/host presente, disponível pra seleção no modal de simulação. */
export const AvailableEvaluatorSchema = z.object({
    userId: z.string().uuid(),
    name: z.string(),
    memberStatus: MemberStatusSchema,
    role: EvaluatorRoleSchema,
});
export type AvailableEvaluator = z.infer<typeof AvailableEvaluatorSchema>;

/**
 * FEAT-0021 — `POST /groups/preview/presencial`. Mesmo shape de grupo que `GET /groups`, mas
 * `groups[].id` é gerado na hora (nunca existiu no banco) — só serve de `key` de lista no
 * front. Nada aqui é persistido (research.md, Decisão 3).
 */
export const PreviewPresencialResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema),
        unallocatedCandidateCount: z.number().int(),
        availableEvaluators: z.array(AvailableEvaluatorSchema),
    }),
});
export type PreviewPresencialResponse = z.infer<typeof PreviewPresencialResponseSchema>;

/**
 * FEAT-0022 — `POST /groups/preview/online`. Mais enxuto que o presencial: sem
 * `unallocatedCandidateCount` (o algoritmo online sempre aloca todos os candidatos presentes,
 * não há noção de capacidade de sala) e sem `availableEvaluators` (avaliador nunca entra no
 * cálculo automático do online — `groups[].evaluators` vem sempre `[]`, atribuição continua
 * exclusivamente manual, depois que a organização real existir).
 */
export const PreviewOnlineResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema),
    }),
});
export type PreviewOnlineResponse = z.infer<typeof PreviewOnlineResponseSchema>;

/**
 * `PATCH .../candidates/{id}` e `PATCH .../evaluators/{id}`. `warning` é
 * `"GENDER_RULE_VIOLATED"` quando o movimento deixa algum dos dois grupos
 * envolvidos com exatamente 1 mulher (FR-010) — aviso, não bloqueio: o corpo
 * ainda é `200`.
 */
export const MoveResultResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema).length(2),
        warning: z.literal("GENDER_RULE_VIOLATED").nullable(),
    }),
});
export type MoveResultResponse = z.infer<typeof MoveResultResponseSchema>;

export const GroupErrorCode = {
    /** `POST /groups/organize` sem nenhum candidato com check-in feito na edição. */
    NO_CANDIDATES_PRESENT: "NO_CANDIDATES_PRESENT",
    /** `POST /groups/organize` com candidato presencial presente e nenhuma sala cadastrada. */
    NO_ROOMS_AVAILABLE: "NO_ROOMS_AVAILABLE",
    /** `groupId` do `PATCH` não existe na edição corrente. */
    GROUP_NOT_FOUND: "GROUP_NOT_FOUND",
    /** `candidateId` do `PATCH .../candidates/{id}` não está alocado a nenhum grupo da edição corrente. */
    CANDIDATE_NOT_ALLOCATED: "CANDIDATE_NOT_ALLOCATED",
    /** `userId` do `PATCH .../evaluators/{id}` não está alocado a nenhum grupo da edição corrente. */
    EVALUATOR_NOT_ALLOCATED: "EVALUATOR_NOT_ALLOCATED",
    /** Mover entre grupo presencial e online — invariante rígida (FR-003), sempre bloqueado. */
    GROUP_MODALITY_MISMATCH: "GROUP_MODALITY_MISMATCH",
} as const;
export type GroupErrorCode = (typeof GroupErrorCode)[keyof typeof GroupErrorCode];
