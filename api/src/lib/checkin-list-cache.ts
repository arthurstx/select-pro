import type { CheckinStatusFilter, Course } from "shared";

import { logger } from "./logger";
import type { CandidateWithCheckinRow } from "../repositories/checkin.repository";

export interface CachedListParams {
    page: number;
    perPage: number;
    status: CheckinStatusFilter;
    search?: string;
    /** FEAT-0015. `undefined` = todos os cursos — precisa entrar em `keyFor`, ver nota lá. */
    course?: Course;
}

export interface CachedListResult {
    items: CandidateWithCheckinRow[];
    total: number;
    /** Contador "X de Y presentes" do cabeçalho — nunca filtrado por status, ver checkin.repository.ts. */
    totalCandidates: number;
    /** FEAT-0010, US3. Cacheado junto — recalcular à parte duplicaria a consulta a cada leitura. */
    attendance: { online: number; presencial: number };
}

/**
 * 60s — o MÍNIMO que o KV da Cloudflare aceita em `expirationTtl` (valores
 * menores fazem `kv.put` rejeitar a escrita). Isso não enfraquece a garantia
 * de frescor no caminho comum: marcar/desmarcar chama `invalidate()`, que
 * troca a geração e faz a PRÓXIMA leitura ignorar qualquer entrada anterior
 * na hora, independente do TTL. Este número só limita o pior caso — se a
 * própria escrita de `invalidate()` falhar (KV fora do ar), quanto tempo uma
 * lista desatualizada pode persistir antes de expirar sozinha.
 */
const TTL_SECONDS = 60;

/** Bem mais longa que `TTL_SECONDS` — a geração nunca pode expirar antes do cache que ela invalida. */
const GENERATION_TTL_SECONDS = 60 * 60 * 24;

/**
 * Cache-aside em KV para `GET /candidates`, com invalidação por geração.
 *
 * Cada variante (página × busca × status) teria sua própria chave — cachear
 * cada uma com TTL fixo resolveria o caso comum, mas depois de marcar ou
 * desmarcar alguém, TODAS as variantes já em cache continuariam servindo o
 * estado velho até expirar. Uma lista de check-in não pode fazer isso: é
 * exatamente o cenário de dois avaliadores olhando a mesma lista ao mesmo
 * tempo que a feature existe para atender.
 *
 * A saída é versionar por processo: cada leitura inclui o número da
 * "geração" corrente na chave; cada escrita bem-sucedida (marcar/desmarcar)
 * incrementa a geração. Isso invalida TODAS as variantes de uma vez, com uma
 * única escrita no KV — sem precisar enumerar nem apagar chave por chave.
 */
export class CheckinListCache {
    constructor(private readonly kv: KVNamespace) {}

    async get(processId: string, params: CachedListParams): Promise<CachedListResult | null> {
        const key = await this.keyFor(processId, params);

        return this.kv.get<CachedListResult>(key, "json").catch((err) => {
            // Cache é otimização — uma falha de leitura no KV não pode derrubar a listagem.
            logger.warn("checkin.list_cache.read_failed", { error: errorMessage(err) });
            return null;
        });
    }

    async set(processId: string, params: CachedListParams, result: CachedListResult): Promise<void> {
        const key = await this.keyFor(processId, params);

        await this.kv.put(key, JSON.stringify(result), { expirationTtl: TTL_SECONDS }).catch((err) => {
            logger.warn("checkin.list_cache.write_failed", { error: errorMessage(err) });
        });
    }

    /** Chamar depois de marcar/desmarcar com sucesso — invalida toda variante em cache deste processo. */
    async invalidate(processId: string): Promise<void> {
        const current = await this.generation(processId);

        await this.kv
            .put(this.generationKey(processId), String(current + 1), { expirationTtl: GENERATION_TTL_SECONDS })
            .catch((err) => {
                // Este, sim, é sério: se a invalidação não gravar, a lista
                // fica errada até o TTL de 60s expirar sozinho.
                logger.error("checkin.list_cache.invalidate_failed", { processId, error: errorMessage(err) });
            });
    }

    private async keyFor(processId: string, params: CachedListParams): Promise<string> {
        const generation = await this.generation(processId);
        const search = params.search?.trim().toLowerCase() ?? "";
        // FEAT-0015 — precisa estar na chave, senão cursos diferentes
        // reaproveitariam a mesma entrada de cache um do outro.
        const course = params.course ?? "";

        return `checkin:list:${processId}:${generation}:${params.page}:${params.perPage}:${params.status}:${search}:${course}`;
    }

    private generationKey(processId: string): string {
        return `checkin:list-gen:${processId}`;
    }

    private async generation(processId: string): Promise<number> {
        const raw = await this.kv.get(this.generationKey(processId)).catch((err) => {
            logger.warn("checkin.list_cache.generation_read_failed", { processId, error: errorMessage(err) });
            return null;
        });
        const parsed = raw ? Number(raw) : 0;

        return Number.isFinite(parsed) ? parsed : 0;
    }
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
