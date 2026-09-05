import type { Attendance, EvaluatorRole, Gender, GroupModality, MemberStatus, RoomRow, RoomType } from "shared";

/** Candidato presente (check-in feito), com os dois dados que o algoritmo precisa (D1/D7). */
export interface PresentCandidateRow {
    id: string;
    name: string;
    gender: Gender;
    attendance: Attendance;
}

/** Avaliador/host presente (check-in de membro feito, FEAT-0010). `memberStatus` desde a FEAT-0021 (badge trainee). */
export interface PresentMemberRow {
    user_id: string;
    name: string;
    role: EvaluatorRole;
    memberStatus: MemberStatus;
}

/** Grupo pronto para persistir — saída do algoritmo (`group-organization.ts`), entrada de `replaceOrganization`. */
export interface GroupToInsert {
    id: string;
    modality: GroupModality;
    /** `null` = grupo online. */
    roomId: string | null;
    name: string;
    candidateIds: string[];
    evaluatorUserIds: string[];
}

/** Linha bruta de leitura da organização já persistida (`GET /groups`, e devolvida por `organize`). */
export interface GroupRow {
    id: string;
    modality: GroupModality;
    room_id: string | null;
    room_name: string | null;
    /** FEAT-0022 — alimenta `GroupSummary.room.type`, pro front reaproveitar `deriveRoomCapacity` sem round-trip. */
    room_type: RoomType | null;
    name: string;
}

export interface GroupCandidateAllocationRow {
    group_id: string;
    candidate_id: string;
    name: string;
    attendance: Attendance;
    gender: Gender;
}

export interface GroupEvaluatorAllocationRow {
    group_id: string;
    user_id: string;
    name: string;
    role: EvaluatorRole;
    memberStatus: MemberStatus;
}

/**
 * Leitura das "fotos" de entrada do algoritmo (candidatos/avaliadores presentes, salas) e
 * escrita transacional da organização resultante. Nenhum método aqui decide D1/D5 — isso é
 * `group-organization.ts`, função pura (research.md D-tech4).
 */
export class GroupRepository {
    constructor(private readonly db: D1Database) {}

    // ------------------------------------------------------------
    // Leitura — entradas do algoritmo (data-model.md, "Fluxo de dados")
    // ------------------------------------------------------------

    /**
     * Candidatos com check-in feito na edição (FR-002), com `gender` (D1) e `attendance`
     * (D7) já derivados — mesma técnica de `checkin.repository.ts#listCandidates`
     * (`LEFT JOIN candidate_applications`, `COALESCE(..., 0)` trata ausência como "sem
     * restrição"/presencial). Ordenado por `checked_in_at ASC` — desempate de FR-013
     * (quem chegou primeiro é alocado primeiro quando falta capacidade de sala).
     */
    async listPresentCandidates(processId: string): Promise<PresentCandidateRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT c.id, c.name, c.gender,
                        CASE WHEN COALESCE(a.saturday_restriction, 0) = 1 THEN 'online' ELSE 'presencial' END AS attendance
                   FROM candidate_checkins cc
                   INNER JOIN candidates c ON c.id = cc.candidate_id
                   LEFT JOIN candidate_applications a ON a.candidate_id = c.id
                  WHERE cc.process_id = ?
                  ORDER BY cc.checked_in_at ASC`,
            )
            .bind(processId)
            .all<PresentCandidateRow>();

        return results ?? [];
    }

    /**
     * Avaliadores/hosts com check-in de membro feito na edição (FR-006) — mesma derivação
     * de cargo de `MemberCheckinRepository.listWithCheckin`, mas já filtrando por presença
     * em vez de trazer todo mundo com estado.
     */
    async listPresentMembers(processId: string): Promise<PresentMemberRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT u.id AS user_id, u.name, p.status AS memberStatus,
                        CASE WHEN eh.user_id IS NOT NULL THEN 'host' ELSE 'avaliador' END AS role
                   FROM member_checkins mc
                   INNER JOIN users u ON u.id = mc.user_id
                   INNER JOIN member_profiles p ON p.user_id = u.id
                   LEFT JOIN edition_hosts eh ON eh.user_id = u.id AND eh.process_id = mc.process_id
                  WHERE mc.process_id = ?
                  ORDER BY u.name ASC`,
            )
            .bind(processId)
            .all<PresentMemberRow>();

        return results ?? [];
    }

    /** `name ASC` — `rooms` não tem `created_at` (mesma ordem de `RoomsRepository.list()`). */
    async listRoomsOrdered(): Promise<RoomRow[]> {
        const { results } = await this.db.prepare("SELECT * FROM rooms ORDER BY name ASC").all<RoomRow>();

        return results ?? [];
    }

    // ------------------------------------------------------------
    // Escrita — substitui a organização inteira (FR-011)
    // ------------------------------------------------------------

    /**
     * `DELETE FROM groups WHERE process_id = ? AND modality = ?` (cascade limpa
     * `group_evaluators`/`group_candidates`) seguido da inserção dos grupos novos — tudo num
     * único `db.batch`, nunca um estado parcialmente escrito (data-model.md). Escopado por
     * `modality` (FEAT-0018): presencial e online são organizados em dias/operações
     * diferentes — organizar um nunca pode apagar o outro. Todo `groups` passado deve ser da
     * mesma `modality` (quem chama garante isso — `GroupService.organizePresencial`/
     * `organizeOnline`).
     */
    async replaceOrganization(processId: string, modality: GroupModality, groups: GroupToInsert[]): Promise<void> {
        const statements: D1PreparedStatement[] = [
            this.db.prepare("DELETE FROM groups WHERE process_id = ? AND modality = ?").bind(processId, modality),
        ];

        for (const group of groups) {
            statements.push(
                this.db
                    .prepare("INSERT INTO groups (id, process_id, room_id, modality, name) VALUES (?, ?, ?, ?, ?)")
                    .bind(group.id, processId, group.roomId, group.modality, group.name),
            );

            for (const candidateId of group.candidateIds) {
                statements.push(
                    this.db
                        .prepare("INSERT INTO group_candidates (group_id, candidate_id) VALUES (?, ?)")
                        .bind(group.id, candidateId),
                );
            }

            for (const userId of group.evaluatorUserIds) {
                statements.push(
                    this.db.prepare("INSERT INTO group_evaluators (group_id, user_id) VALUES (?, ?)").bind(group.id, userId),
                );
            }
        }

        await this.db.batch(statements);
    }

    // ------------------------------------------------------------
    // Leitura da organização já persistida (`GET /groups`, resultado de `organize`)
    // ------------------------------------------------------------

    async listGroups(processId: string): Promise<GroupRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT g.id, g.modality, g.room_id, r.name AS room_name, r.type AS room_type, g.name
                   FROM groups g
                   LEFT JOIN rooms r ON r.id = g.room_id
                  WHERE g.process_id = ?
                  ORDER BY r.name ASC, g.name ASC`,
            )
            .bind(processId)
            .all<GroupRow>();

        return results ?? [];
    }

    async listCandidateAllocations(processId: string): Promise<GroupCandidateAllocationRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT gc.group_id, gc.candidate_id,
                        c.name, c.gender,
                        CASE WHEN COALESCE(a.saturday_restriction, 0) = 1 THEN 'online' ELSE 'presencial' END AS attendance
                   FROM group_candidates gc
                   INNER JOIN candidates c ON c.id = gc.candidate_id
                   LEFT JOIN candidate_applications a ON a.candidate_id = c.id
                   INNER JOIN groups g ON g.id = gc.group_id
                  WHERE g.process_id = ?`,
            )
            .bind(processId)
            .all<GroupCandidateAllocationRow>();

        return results ?? [];
    }

    async listEvaluatorAllocations(processId: string): Promise<GroupEvaluatorAllocationRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT ge.group_id, ge.user_id,
                        u.name, p.status AS memberStatus,
                        CASE WHEN g.modality = 'presencial' AND eh.user_id IS NOT NULL THEN 'host' ELSE 'avaliador' END AS role
                   FROM group_evaluators ge
                   INNER JOIN users u ON u.id = ge.user_id
                   INNER JOIN member_profiles p ON p.user_id = u.id
                   INNER JOIN groups g ON g.id = ge.group_id
                   LEFT JOIN edition_hosts eh ON eh.user_id = u.id AND eh.process_id = g.process_id
                  WHERE g.process_id = ?`,
            )
            .bind(processId)
            .all<GroupEvaluatorAllocationRow>();

        return results ?? [];
    }

    // ------------------------------------------------------------
    // Ajuste manual (US2)
    // ------------------------------------------------------------

    /** Sem filtro de `processId` — usado só depois que o caller já validou a posse do grupo (ver `GroupService.buildSummary`). */
    async getGroupRow(groupId: string): Promise<GroupRow | null> {
        return this.db
            .prepare(
                `SELECT g.id, g.modality, g.room_id, r.name AS room_name, r.type AS room_type, g.name
                   FROM groups g
                   LEFT JOIN rooms r ON r.id = g.room_id
                  WHERE g.id = ?`,
            )
            .bind(groupId)
            .first<GroupRow>();
    }

    async listCandidateAllocationsForGroup(groupId: string): Promise<GroupCandidateAllocationRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT gc.group_id, gc.candidate_id,
                        c.name, c.gender,
                        CASE WHEN COALESCE(a.saturday_restriction, 0) = 1 THEN 'online' ELSE 'presencial' END AS attendance
                   FROM group_candidates gc
                   INNER JOIN candidates c ON c.id = gc.candidate_id
                   LEFT JOIN candidate_applications a ON a.candidate_id = c.id
                  WHERE gc.group_id = ?`,
            )
            .bind(groupId)
            .all<GroupCandidateAllocationRow>();

        return results ?? [];
    }

    async listEvaluatorAllocationsForGroup(groupId: string): Promise<GroupEvaluatorAllocationRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT ge.group_id, ge.user_id,
                        u.name, p.status AS memberStatus,
                        CASE WHEN g.modality = 'presencial' AND eh.user_id IS NOT NULL THEN 'host' ELSE 'avaliador' END AS role
                   FROM group_evaluators ge
                   INNER JOIN users u ON u.id = ge.user_id
                   INNER JOIN member_profiles p ON p.user_id = u.id
                   INNER JOIN groups g ON g.id = ge.group_id
                   LEFT JOIN edition_hosts eh ON eh.user_id = u.id AND eh.process_id = g.process_id
                  WHERE ge.group_id = ?`,
            )
            .bind(groupId)
            .all<GroupEvaluatorAllocationRow>();

        return results ?? [];
    }

    async findGroupById(groupId: string, processId: string): Promise<GroupRow | null> {
        return this.db
            .prepare(
                `SELECT g.id, g.modality, g.room_id, r.name AS room_name, r.type AS room_type, g.name
                   FROM groups g
                   LEFT JOIN rooms r ON r.id = g.room_id
                  WHERE g.id = ? AND g.process_id = ?`,
            )
            .bind(groupId, processId)
            .first<GroupRow>();
    }

    /** Grupo (com modalidade) a que um candidato está atualmente alocado, dentro da edição. */
    async findCandidateGroup(candidateId: string, processId: string): Promise<GroupRow | null> {
        return this.db
            .prepare(
                `SELECT g.id, g.modality, g.room_id, r.name AS room_name, r.type AS room_type, g.name
                   FROM group_candidates gc
                   INNER JOIN groups g ON g.id = gc.group_id
                   LEFT JOIN rooms r ON r.id = g.room_id
                  WHERE gc.candidate_id = ? AND g.process_id = ?`,
            )
            .bind(candidateId, processId)
            .first<GroupRow>();
    }

    async findEvaluatorGroup(userId: string, processId: string): Promise<GroupRow | null> {
        return this.db
            .prepare(
                `SELECT g.id, g.modality, g.room_id, r.name AS room_name, r.type AS room_type, g.name
                   FROM group_evaluators ge
                   INNER JOIN groups g ON g.id = ge.group_id
                   LEFT JOIN rooms r ON r.id = g.room_id
                  WHERE ge.user_id = ? AND g.process_id = ?`,
            )
            .bind(userId, processId)
            .first<GroupRow>();
    }

    async moveCandidate(candidateId: string, toGroupId: string): Promise<void> {
        await this.db
            .prepare("UPDATE group_candidates SET group_id = ? WHERE candidate_id = ?")
            .bind(toGroupId, candidateId)
            .run();
    }

    async moveEvaluator(userId: string, toGroupId: string): Promise<void> {
        await this.db.prepare("UPDATE group_evaluators SET group_id = ? WHERE user_id = ?").bind(toGroupId, userId).run();
    }

    /**
     * FEAT-0018 — alocação de avaliador a um grupo online, por ação humana (self-service ou
     * atribuição manual do admin), nunca por algoritmo. `ON CONFLICT(user_id)` usa o
     * `UNIQUE(user_id)` já existente (migration `0014`, "uma pessoa, um grupo por vez") para
     * cobrir tanto a primeira entrada quanto mover de outro grupo (presencial ou online) numa
     * instrução só, sem checar `fromGroup` antes (research.md, Decisão 3).
     */
    async assignEvaluator(userId: string, groupId: string): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO group_evaluators (group_id, user_id) VALUES (?, ?)
                 ON CONFLICT(user_id) DO UPDATE SET group_id = excluded.group_id`,
            )
            .bind(groupId, userId)
            .run();
    }

    /** FEAT-0018 — avaliador sai do grupo online em que estiver. Devolve se havia vínculo pra remover. */
    async removeEvaluator(userId: string): Promise<boolean> {
        const result = await this.db.prepare("DELETE FROM group_evaluators WHERE user_id = ?").bind(userId).run();
        return result.meta.changes > 0;
    }

    /** Quantas mulheres um grupo tem — usado para decidir o aviso `GENDER_RULE_VIOLATED` (FR-010) após um `move*`. */
    async countWomenInGroup(groupId: string): Promise<number> {
        const row = await this.db
            .prepare(
                `SELECT COUNT(*) AS total
                   FROM group_candidates gc
                   INNER JOIN candidates c ON c.id = gc.candidate_id
                  WHERE gc.group_id = ? AND c.gender = 'feminino'`,
            )
            .bind(groupId)
            .first<{ total: number }>();

        return row?.total ?? 0;
    }
}
