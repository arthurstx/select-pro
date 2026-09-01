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
  // FEAT-0008 — restrita a admin na própria página; aparece pra todos aqui
  // pelo mesmo motivo dos outros itens (o guard real é a API, não o menu).
  { href: "/painel/solicitacoes", label: "Solicitações", icon: UserCheckIcon },
  // FEAT-0011 — mesmo motivo.
  { href: "/painel/salas", label: "Salas", icon: DoorOpenIcon },
  // FEAT-0009 — mesmo motivo.
  { href: "/painel/avaliadores", label: "Avaliadores", icon: UsersIcon },
  // FEAT-0010 — mesmo motivo.
  { href: "/painel/check-in-membros", label: "Check-in de Membros", icon: UserRoundCheckIcon },
  // FEAT-0019 — Grupos + Check-in de cada modalidade, agrupados por dia/fluxo (presencial
  // e online não compartilham avaliadores nem acontecem no mesmo dia).
  {
    label: "Presencial",
    icon: UsersRoundIcon,
    children: [
      { href: "/painel/grupos/presencial", label: "Grupos Presenciais", icon: UsersRoundIcon },
      { href: "/painel/check-in/presencial", label: "Check-in Presencial", icon: ClipboardCheckIcon },
    ],
  },
  {
    label: "Online",
    icon: VideoIcon,
    children: [
      { href: "/painel/grupos/online", label: "Grupos Online", icon: VideoIcon },
      { href: "/painel/check-in/online", label: "Check-in Online", icon: ClipboardCheckIcon },
    ],
  },
  // FEAT-0013 — mesmo motivo dos itens de folha. Tela do avaliador/host (não do admin), mas
  // o guard real segue sendo a API, não o menu (mesma nota acima).
  { href: "/painel/minhas-avaliacoes", label: "Minhas Avaliações", icon: StarIcon },
  { href: "/painel/avaliacoes", label: "Avaliações", icon: ClipboardListIcon },
  // FEAT-0017 — mesmo motivo.
  { href: "/painel/processos", label: "Processos seletivos", icon: CalendarCogIcon },
];
