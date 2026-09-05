import type { NewRoom, RoomRow, RoomType } from "shared";

/**
 * SQL puro sobre `rooms(id, name, type)`. Sem lógica de classificação aqui —
 * `hostCount`/`maxGroups` são derivados em `shared` (`deriveRoomCapacity`),
 * aplicados pelo service na borda de saída.
 */
export class RoomsRepository {
    constructor(private readonly db: D1Database) {}

    async create(room: NewRoom): Promise<RoomRow> {
        const result = await this.db
            .prepare("INSERT INTO rooms (id, name, type) VALUES (?, ?, ?) RETURNING *")
            .bind(room.id, room.name, room.type)
            .first<RoomRow>();

        // RETURNING sempre devolve a linha inserida num INSERT bem-sucedido.
        return result!;
    }

    async findById(id: string): Promise<RoomRow | null> {
        return this.db.prepare("SELECT * FROM rooms WHERE id = ?").bind(id).first<RoomRow>();
    }

    async findByName(name: string): Promise<RoomRow | null> {
        return this.db.prepare("SELECT * FROM rooms WHERE name = ?").bind(name).first<RoomRow>();
    }

    async list(): Promise<RoomRow[]> {
        const { results } = await this.db
            .prepare("SELECT * FROM rooms ORDER BY name ASC")
            .all<RoomRow>();

        return results ?? [];
    }

    /**
     * `name`/`type` obrigatórios, não `RoomUpdate` de `shared` (que é
     * `Partial` — feito para PATCH). Este `PUT` substitui os dois campos
     * juntos sempre; um tipo parcial aqui deixaria `undefined` virar `NULL`
     * no bind.
     */
    async update(update: { id: string; name: string; type: RoomType }): Promise<RoomRow | null> {
        return this.db
            .prepare("UPDATE rooms SET name = ?, type = ? WHERE id = ? RETURNING *")
            .bind(update.name, update.type, update.id)
            .first<RoomRow>();
    }

    /** Erro cru sobe para o service traduzir (violação de FK vira `RoomHasGroupsError` — ver `d1-errors.ts`/R3). */
    async delete(id: string): Promise<boolean> {
        const result = await this.db.prepare("DELETE FROM rooms WHERE id = ?").bind(id).run();

        return result.meta.changes > 0;
    }
}
