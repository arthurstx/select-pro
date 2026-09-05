import type { LucideIcon } from "lucide-react";
import {
  CalendarCogIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DoorOpenIcon,
  LayoutDashboardIcon,
  StarIcon,
  UserCheckIcon,
  UserRoundCheckIcon,
  UsersIcon,
  UsersRoundIcon,
  VideoIcon,
} from "lucide-react";

/**
 * Só os itens que têm rota de verdade. O mockup do Stitch (Check-in de
 * Candidatos) desenha também Candidatos/Avaliações/Grupos/Configurações —
 * essas telas não existem ainda, e um link que não leva a lugar nenhum é
 * pior do que nenhum link. Quando a spec de cada uma chegar, ela entra aqui
 * (FEAT-0005-UI, seção 12).
 *
 * Quem pode ver cada item não mora aqui: a matriz de papéis por rota está em
 * `lib/auth/route-roles.ts` e a poda acontece no `PainelNavContent`.
 */
export interface PainelNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * FEAT-0018/FEAT-0019 — presencial e online são operacionalmente independentes (dias e
 * pessoas diferentes), então viram agrupadores de topo na nav, cada um com sub-rotas.
 * Sem `href` próprio: o item em si não navega, só expande.
 */
export interface PainelNavGroup {
  label: string;
  icon: LucideIcon;
  children: PainelNavItem[];
}

export type PainelNavEntry = PainelNavItem | PainelNavGroup;

export function isPainelNavGroup(entry: PainelNavEntry): entry is PainelNavGroup {
  return "children" in entry;
}

export const PAINEL_NAV_ITEMS: PainelNavEntry[] = [
  { href: "/painel", label: "Painel", icon: LayoutDashboardIcon },
  // FEAT-0019 — Grupos + Check-in de cada modalidade, agrupados por dia/fluxo (presencial
  // e online não compartilham avaliadores nem acontecem no mesmo dia). Salas entrou aqui
  // depois (pedido do usuário) — é recurso do presencial (D5), sem equivalente online.
  // Itens em ordem alfabética dentro do grupo.
  {
    label: "Presencial",
    icon: UsersRoundIcon,
    children: [
      { href: "/painel/check-in/presencial", label: "Check-in Presencial", icon: ClipboardCheckIcon },
      { href: "/painel/grupos/presencial", label: "Grupos Presenciais", icon: UsersRoundIcon },
      { href: "/painel/salas", label: "Salas", icon: DoorOpenIcon },
    ],
  },
  {
    label: "Online",
    icon: VideoIcon,
    children: [
      { href: "/painel/check-in/online", label: "Check-in Online", icon: ClipboardCheckIcon },
      { href: "/painel/grupos/online", label: "Grupos Online", icon: VideoIcon },
    ],
  },
  // Agrupador pedido pelo usuário — cadastro/gestão de quem avalia, separado da operação
  // presencial/online do dia do processo seletivo. Itens em ordem alfabética.
  {
    label: "Membros",
    icon: UsersIcon,
    children: [
      { href: "/painel/avaliadores", label: "Avaliadores", icon: UsersIcon },
      { href: "/painel/check-in-membros", label: "Check-in de Membros", icon: UserRoundCheckIcon },
      { href: "/painel/solicitacoes", label: "Solicitações", icon: UserCheckIcon },
    ],
  },
  // FEAT-0013 — tela do avaliador/host, escondida do admin (`route-roles.ts`).
  { href: "/painel/minhas-avaliacoes", label: "Minhas Avaliações", icon: StarIcon },
  { href: "/painel/avaliacoes", label: "Avaliações", icon: ClipboardListIcon },
  // FEAT-0017 — só admin, idem.
  { href: "/painel/processos", label: "Processos seletivos", icon: CalendarCogIcon },
];
