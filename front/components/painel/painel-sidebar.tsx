"use client";

import { PainelNavContent } from "./painel-nav-content";

/**
 * Sidebar compartilhada da área logada — a primeira do projeto (FEAT-0005-UI,
 * seção 12). Vive no layout, não na página de check-in, porque os mockups do
 * Stitch já mostram a mesma sidebar em outras telas (Dashboard Avaliador,
 * Gestão de Usuários) que ainda não têm spec.
 *
 * `bg-secondary`/`text-secondary-foreground` não é reaproveitamento por
 * acaso: o token `--secondary` do projeto (`#0E0E0E`) já É a cor de fundo
 * escura que o mockup usa para a nav — nasceu para outra coisa, mas é
 * exatamente essa cor.
 *
 * O conteúdo em si mora em `PainelNavContent`, compartilhado com a gaveta do
 * mobile (`PainelMobileNav`).
 */
export function PainelSidebar() {
  return (
    <aside className="bg-secondary text-secondary-foreground fixed inset-y-0 left-0 z-40 hidden w-64 flex-col py-6 md:flex">
      <PainelNavContent />
    </aside>
  );
}
