"use client";

import { LogOutIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

import { PAINEL_NAV_ITEMS } from "./painel-nav";

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
 */
export function PainelSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  return (
    <aside className="bg-secondary text-secondary-foreground fixed inset-y-0 left-0 z-40 hidden w-64 flex-col py-6 md:flex">
      <div className="flex items-center gap-3 px-6 pb-8">
        <div className="bg-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <ClipboardIcon />
        </div>
        <div>
          <p className="font-heading text-lg leading-tight font-bold">SelectPro</p>
          <p className="text-secondary-foreground/60 text-[11px] font-semibold tracking-wider uppercase">
            CIMATEC Jr.
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Navegação principal">
        {PAINEL_NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-secondary-foreground border-primary border-l-4 pl-2.5 font-semibold"
                  : "text-secondary-foreground/75 hover:bg-white/10 hover:text-secondary-foreground",
              )}
            >
              <Icon className={cn("size-4.5", active && "text-primary")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-secondary-foreground/10 mt-auto border-t px-3 pt-3">
        <button
          type="button"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void signOut();
          }}
          className="text-secondary-foreground/75 hover:bg-white/10 hover:text-secondary-foreground flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {leaving ? <Spinner className="size-4.5" aria-hidden /> : <LogOutIcon className="size-4.5" aria-hidden />}
          Sair
        </button>
        {user && (
          <p className="text-secondary-foreground/50 truncate px-3 pt-2 text-xs" title={user.email}>
            {user.name}
          </p>
        )}
      </div>
    </aside>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 text-white" aria-hidden>
      <path
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-5 8 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
