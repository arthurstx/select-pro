"use client";

import { LogOutIcon } from "lucide-react";
import { useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";

import { PainelMobileNav } from "./painel-mobile-nav";

/**
 * Chrome mínimo da área logada no mobile — hambúrguer + marca + sair. O título de cada
 * tela (ex.: "Check-in de Candidatos") é conteúdo da página, não do layout;
 * duplicar aqui gastaria duas linhas de tela num contexto em que espaço é
 * escasso (FEAT-0005-UI, seção 2: o avaliador está de pé, com uma mão).
 */
export function PainelTopBar() {
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  return (
    <header className="border-border bg-background sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 md:hidden">
      <div className="flex items-center gap-2">
        <PainelMobileNav />
        <span className="font-heading text-base font-bold tracking-tight">SelectPro</span>
      </div>
      <button
        type="button"
        disabled={leaving}
        aria-label="Sair da conta"
        onClick={() => {
          setLeaving(true);
          void signOut();
        }}
        className="text-muted-foreground flex size-9 items-center justify-center rounded-full disabled:opacity-60"
      >
        {leaving ? <Spinner className="size-4.5" aria-hidden /> : <LogOutIcon className="size-4.5" aria-hidden />}
      </button>
    </header>
  );
}
