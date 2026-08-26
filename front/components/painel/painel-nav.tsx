import type { LucideIcon } from "lucide-react";
import {
  ClipboardCheckIcon,
  DoorOpenIcon,
  LayoutDashboardIcon,
  UserCheckIcon,
  UserRoundCheckIcon,
  UsersIcon,
  UsersRoundIcon,
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

export const PAINEL_NAV_ITEMS: PainelNavItem[] = [
  { href: "/painel", label: "Painel", icon: LayoutDashboardIcon },
  { href: "/painel/check-in", label: "Check-in", icon: ClipboardCheckIcon },
  // FEAT-0008 — restrita a admin na própria página; aparece pra todos aqui
  // pelo mesmo motivo dos outros itens (o guard real é a API, não o menu).
  { href: "/painel/solicitacoes", label: "Solicitações", icon: UserCheckIcon },
  // FEAT-0011 — mesmo motivo.
  { href: "/painel/salas", label: "Salas", icon: DoorOpenIcon },
  // FEAT-0009 — mesmo motivo.
  { href: "/painel/avaliadores", label: "Avaliadores", icon: UsersIcon },
  // FEAT-0010 — mesmo motivo.
  { href: "/painel/check-in-membros", label: "Check-in de Membros", icon: UserRoundCheckIcon },
  // FEAT-0012 — mesmo motivo.
  { href: "/painel/grupos", label: "Grupos", icon: UsersRoundIcon },
];
