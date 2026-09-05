"use client";

import { MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { PainelNavContent } from "./painel-nav-content";

/**
 * Navegação do mobile. Começou como barra inferior fixa porque só havia dois
 * destinos; com Presencial/Online/Membros a barra viraria dez ícones achatados
 * numa faixa de ~40px — ilegível e impossível de acertar com o polegar. Agora é
 * a MESMA sidebar do desktop, servida numa gaveta pelo hambúrguer da topbar:
 * um toque a mais, mas com os grupos expansíveis e os rótulos inteiros.
 */
export function PainelMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Rotas que trocam sem clique em link daqui (redirect, botão de uma página)
  // não podem deixar a gaveta aberta por cima do conteúdo novo. Ajuste em
  // render, não em efeito: é derivar estado de uma mudança, não sincronizar
  // com sistema externo.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Abrir navegação"
        className="text-muted-foreground -ml-2 flex size-9 items-center justify-center rounded-full md:hidden"
      >
        <MenuIcon className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="bg-secondary text-secondary-foreground w-72 gap-0 py-6 sm:max-w-xs [&>button]:top-6 [&>button]:right-4"
      >
        <SheetTitle className="sr-only">Navegação principal</SheetTitle>
        <PainelNavContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
