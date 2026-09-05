import type { Role } from "shared";

// Só os tipos: `import type` é apagado na compilação, então este módulo não
// arrasta a sidebar (nem os ícones dela) para dentro dos testes de unidade.
import type { PainelNavEntry, PainelNavItem } from "@/components/painel/painel-nav";

/**
 * Literais em vez de `ROLES` do `shared` de propósito: o barrel do pacote usa
 * imports sem extensão e não carrega sob `node --test`, e este módulo tem
 * testes de unidade (`route-roles.test.ts`). O `satisfies Role` mantém a
 * garantia — se `ROLES` mudar em `shared/src/schemas/auth.schema.ts`, o tsc
 * quebra aqui. Não copie esse padrão para código sem teste: lá é `ROLES`.
 */
const ADMIN = "admin" satisfies Role;
const AVALIADOR = "avaliador" satisfies Role;

const BOTH: readonly Role[] = [ADMIN, AVALIADOR];

/**
 * Espelha os middlewares de papel da API (`requireRole` em `api/src/routes/*`).
 * Fonte única para dois consumidores: o filtro da sidebar (`filterNavForRole`)
 * e o guard de rota (`RouteRoleGuard`) — assim a nav nunca mostra um destino
 * que a tela vai negar, nem esconde um que ela aceitaria.
 *
 * Ao criar uma rota nova sob `/painel`, adicione a linha aqui junto com o
 * middleware da API. Esquecer não tranca ninguém para fora (ver `rolesForRoute`),
 * só devolve o 403 cru de hoje.
 */
const ROUTE_ROLES: ReadonlyArray<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/painel/minhas-avaliacoes", roles: [AVALIADOR] },
  { prefix: "/painel/check-in-membros", roles: [ADMIN] },
  { prefix: "/painel/check-in", roles: BOTH },
  { prefix: "/painel/avaliacoes", roles: [ADMIN] },
  { prefix: "/painel/avaliadores", roles: [ADMIN] },
  // Presencial e online: as duas telas montam a `GroupsView`, que busca
  // `GET /groups` — admin-only na API.
  { prefix: "/painel/grupos", roles: [ADMIN] },
  { prefix: "/painel/processos", roles: [ADMIN] },
  { prefix: "/painel/salas", roles: [ADMIN] },
  { prefix: "/painel/solicitacoes", roles: [ADMIN] },
  // Dashboard e fallback de qualquer `/painel/*` não listada.
  { prefix: "/painel", roles: BOTH },
];

/**
 * Prefixo mais longo vence, independentemente da ordem da tabela acima — sem
 * isto `/painel/check-in` engoliria `/painel/check-in-membros`.
 */
const ROUTE_ROLES_BY_SPECIFICITY = [...ROUTE_ROLES].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

/**
 * Estreita o `role: z.string()` do `AuthUserSchema` (deliberadamente frouxo:
 * ele parseia a resposta de login/refresh, e um papel novo no backend deve
 * degradar, não quebrar o login). Papel desconhecido vira `null` — sem acesso.
 */
export function asRole(value: string | null | undefined): Role | null {
  return value === ADMIN || value === AVALIADOR ? value : null;
}

/** Papéis aceitos numa rota. Rota não listada libera os dois — a API é a barreira real. */
export function rolesForRoute(pathname: string): readonly Role[] {
  const match = ROUTE_ROLES_BY_SPECIFICITY.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return match?.roles ?? BOTH;
}

export function canAccessRoute(role: Role | null, pathname: string): boolean {
  return role !== null && rolesForRoute(pathname).includes(role);
}

/**
 * Poda a nav para o papel informado.
 *
 * Um grupo cujos filhos sumiram todos desaparece; sobrando um só, ele é
 * promovido a item de topo — acordeão de um item é ruído, e os rótulos dos
 * filhos ("Check-in Presencial") já leem bem sozinhos. Isso faz a nav do
 * avaliador ter forma diferente da do admin, o que é intencional.
 */
export function filterNavForRole(
  entries: readonly PainelNavEntry[],
  role: Role | null,
): PainelNavEntry[] {
  // Papel ainda desconhecido: melhor nav vazia por um instante do que piscar
  // itens que vão sumir.
  if (role === null) return [];

  const kept: PainelNavEntry[] = [];

  for (const entry of entries) {
    if (!("children" in entry)) {
      if (canAccessRoute(role, entry.href)) kept.push(entry);
      continue;
    }

    const children: PainelNavItem[] = entry.children.filter((child) =>
      canAccessRoute(role, child.href),
    );
    if (children.length === 0) continue;
    kept.push(children.length === 1 ? children[0] : { ...entry, children });
  }

  return kept;
}
