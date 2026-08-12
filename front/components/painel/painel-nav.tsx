import type { LucideIcon } from "lucide-react";
import { ClipboardCheckIcon, LayoutDashboardIcon } from "lucide-react";

/**
 * Só os dois itens que têm rota de verdade. O mockup do Stitch (Check-in de
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
];
