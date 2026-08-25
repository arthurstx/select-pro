import { RoomErrorCode } from "shared";

// Erros de domínio do cadastro de salas (FEAT-0011). O status HTTP fica na
// rota, não aqui — mesmo padrão de auth-errors.ts.

export class RoomNotFoundError extends Error {
    readonly code = RoomErrorCode.ROOM_NOT_FOUND;

    constructor(message = "Sala não encontrada.") {
        super(message);
        this.name = "RoomNotFoundError";
    }
}

export class RoomNameAlreadyExistsError extends Error {
    readonly code = RoomErrorCode.ROOM_NAME_ALREADY_EXISTS;
    readonly field = "name";

    constructor(message = "Já existe uma sala com este nome.") {
        super(message);
        this.name = "RoomNameAlreadyExistsError";
    }
}

/** FR-009 — a FK `groups.room_id ... ON DELETE RESTRICT` (0001) já impede a exclusão; isto só nomeia a violação. */
export class RoomHasGroupsError extends Error {
    readonly code = RoomErrorCode.ROOM_HAS_GROUPS;

    constructor(
        message = "Esta sala tem grupos vinculados a ela e não pode ser excluída.",
    ) {
        super(message);
        this.name = "RoomHasGroupsError";
    }
}
