import type { PendingRegistration } from "shared";

const KEY_PREFIX = "pending-registration:";

export class PendingRegistrationRepository {
    constructor(private readonly kv: KVNamespace) {}

    private key(pendingId: string): string {
        return `${KEY_PREFIX}${pendingId}`;
    }

    /**
     * Grava (ou regrava, ex: ao incrementar `attempts`) a entrada pendente.
     * O TTL do KV é sempre derivado de `data.otc.expires_at` — única fonte de
     * verdade sobre expiração (FEAT-0001 seção 9). Regravar com o mesmo
     * `expires_at` mantém o mesmo instante de expiração absoluto.
     */
    async put(pendingId: string, data: PendingRegistration): Promise<void> {
        const expiration = Math.floor(new Date(data.otc.expires_at).getTime() / 1000);
        await this.kv.put(this.key(pendingId), JSON.stringify(data), { expiration });
    }

    async get(pendingId: string): Promise<PendingRegistration | null> {
        return this.kv.get<PendingRegistration>(this.key(pendingId), "json");
    }

    async delete(pendingId: string): Promise<void> {
        await this.kv.delete(this.key(pendingId));
    }
}
