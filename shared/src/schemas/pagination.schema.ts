import { z } from "zod";

// Paginação — convenção genérica do projeto, nascida em FEAT-0005 (`GET
// /candidates` é o primeiro endpoint paginado). Qualquer listagem futura
// deve reutilizar estes dois schemas em vez de reinventar o formato.

/**
 * `per_page` acima de 100 é rejeitado com `400`, não reduzido em silêncio
 * (FEAT-0005, seção 8.2) — um clamp silencioso faria o cliente pedir 500,
 * receber 100, e paginar como se tivesse recebido tudo.
 */
export const PaginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginationMetaSchema = z.object({
    page: z.number().int().min(1),
    perPage: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
