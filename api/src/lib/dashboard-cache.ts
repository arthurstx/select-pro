import { logger } from "./logger";

/**
 * 60s — o mínimo que o KV da Cloudflare aceita em `expirationTtl`, e aqui é
 * também o suficiente.
 *
 * **Sem invalidação por geração, ao contrário de `checkin-list-cache.ts`.**
 * Lá o cenário que a feature existia para atender era dois avaliadores
 * olhando a mesma lista ao mesmo tempo, e servir estado velho por um minuto
 * quebrava justamente isso. Um dashboard 60s atrasado não quebra nada.
 * Invalidar por geração exigiria `CandidateService.register` conhecer o
 * dashboard — acoplamento que o ganho não paga (FEAT-0007, seção 9).
 */
const TTL_SECONDS = 60;

/**
 * Cache-aside em KV para as leituras do dashboard (FEAT-0007).
 *
 * A chave é montada por quem chama, e **precisa incluir o papel** — ver
 * `dashboard.service.ts`. É o ponto mais perigoso da feature: sem o papel na
 * chave, um `avaliador` recebe a resposta cacheada de um `admin`, com
 * demografia junto, e nada na tela denuncia isso.
 */
export class DashboardCache {
    constructor(private readonly kv: KVNamespace) {}

    async get<T>(key: string): Promise<T | null> {
        return this.kv.get<T>(key, "json").catch((err) => {
            // Cache é otimização — falha de leitura no KV não derruba a tela.
            logger.warn("dashboard.cache.read_failed", { error: errorMessage(err) });
            return null;
        });
    }

    async set(key: string, value: unknown): Promise<void> {
        await this.kv.put(key, JSON.stringify(value), { expirationTtl: TTL_SECONDS }).catch((err) => {
            logger.warn("dashboard.cache.write_failed", { error: errorMessage(err) });
        });
    }
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
