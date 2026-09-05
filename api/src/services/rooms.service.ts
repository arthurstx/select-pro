import { deriveRoomCapacity, type CreateRoomDTO, type RoomSummary, type UpdateRoomDTO } from "shared";
import type { RoomRow } from "shared";

import { type Either, left, right } from "../core/either";
import { RoomHasGroupsError, RoomNameAlreadyExistsError, RoomNotFoundError } from "../core/errors/room-errors";
import { logger } from "../lib/logger";
import type { RoomsRepository } from "../repositories/rooms.repository";

export type RoomWriteError = RoomNameAlreadyExistsError;
export type RoomUpdateError = RoomNotFoundError | RoomNameAlreadyExistsError;
export type RoomDeleteError = RoomNotFoundError | RoomHasGroupsError;

export class RoomsService {
    constructor(private readonly repository: RoomsRepository) {}

    async create(input: CreateRoomDTO): Promise<Either<RoomWriteError, RoomSummary>> {
        const existing = await this.repository.findByName(input.name);
        if (existing) {
            logger.warn("rooms.create.name_conflict", { name: input.name });
            return left(new RoomNameAlreadyExistsError());
        }

        let row: RoomRow;
        try {
            row = await this.repository.create({ id: crypto.randomUUID(), name: input.name, type: input.type });
        } catch (err) {
            // Corrida entre a checagem acima e o INSERT — o índice único fecha a janela.
            if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
                logger.warn("rooms.create.race_name_conflict", { name: input.name });
                return left(new RoomNameAlreadyExistsError());
            }
            throw err;
        }

        logger.info("rooms.create.success", { roomId: row.id, name: row.name });
        return right(toSummary(row));
    }

    async list(): Promise<RoomSummary[]> {
        const rows = await this.repository.list();
        return rows.map(toSummary);
    }

    async update(id: string, input: UpdateRoomDTO): Promise<Either<RoomUpdateError, RoomSummary>> {
        const existing = await this.repository.findById(id);
        if (!existing) {
            logger.warn("rooms.update.not_found", { roomId: id });
            return left(new RoomNotFoundError());
        }

        if (input.name !== existing.name) {
            const conflicting = await this.repository.findByName(input.name);
            if (conflicting && conflicting.id !== id) {
                logger.warn("rooms.update.name_conflict", { roomId: id, name: input.name });
                return left(new RoomNameAlreadyExistsError());
            }
        }

        let row: RoomRow | null;
        try {
            row = await this.repository.update({ id, name: input.name, type: input.type });
        } catch (err) {
            if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
                logger.warn("rooms.update.race_name_conflict", { roomId: id, name: input.name });
                return left(new RoomNameAlreadyExistsError());
            }
            throw err;
        }

        if (!row) {
            // Corrida: existia no findById acima, sumiu antes do UPDATE.
            logger.warn("rooms.update.vanished", { roomId: id });
            return left(new RoomNotFoundError());
        }

        logger.info("rooms.update.success", { roomId: id });
        return right(toSummary(row));
    }

    /**
     * FR-009 — a FK `groups.room_id ... ON DELETE RESTRICT` (migration 0001)
     * já impede a exclusão; aqui só traduzimos a violação (R3, sem
     * reimplementar a checagem em código — uma corrida entre "checar se tem
     * grupo" e "excluir" ficaria aberta se a checagem fosse só na aplicação).
     */
    async delete(id: string): Promise<Either<RoomDeleteError, void>> {
        const existing = await this.repository.findById(id);
        if (!existing) {
            logger.warn("rooms.delete.not_found", { roomId: id });
            return left(new RoomNotFoundError());
        }

        try {
            await this.repository.delete(id);
        } catch (err) {
            if (err instanceof Error && err.message.includes("FOREIGN KEY constraint failed")) {
                logger.warn("rooms.delete.has_groups", { roomId: id });
                return left(new RoomHasGroupsError());
            }
            throw err;
        }

        logger.info("rooms.delete.success", { roomId: id });
        return right(undefined);
    }
}

function toSummary(row: RoomRow): RoomSummary {
    return { id: row.id, name: row.name, type: row.type, ...deriveRoomCapacity(row.type) };
}
