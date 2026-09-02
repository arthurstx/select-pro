"use client";

import { ChevronDownIcon, ListChecksIcon, LogOutIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

import { isPainelNavGroup, PAINEL_NAV_ITEMS, type PainelNavGroup, type PainelNavItem } from "./painel-nav";

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
          <ListChecksIcon className="size-5 text-white" aria-hidden />
        </div>
        <div>
          <p className="font-heading text-lg leading-tight font-bold">SelectPro</p>
          <p className="text-secondary-foreground/60 text-[11px] font-semibold tracking-wider uppercase">
            CIMATEC Jr.
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Navegação principal">
        {PAINEL_NAV_ITEMS.map((item) =>
          isPainelNavGroup(item) ? (
            <NavGroup key={item.label} group={item} pathname={pathname} />
          ) : (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ),
        )}
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

function NavLink({ item, active }: { item: PainelNavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
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
}

/** FEAT-0018 — "Grupos" expande em Online/Presencial. Abre sozinho quando uma das duas está ativa. */
function NavGroup({ group, pathname }: { group: PainelNavGroup; pathname: string }) {
  const childActive = group.children.some((child) => pathname === child.href);
  const [open, setOpen] = useState(childActive);
  const Icon = group.icon;

  return (
    <Collapsible open={open || childActive} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          childActive
            ? "text-secondary-foreground font-semibold"
            : "text-secondary-foreground/75 hover:bg-white/10 hover:text-secondary-foreground",
        )}
      >
        <Icon className={cn("size-4.5", childActive && "text-primary")} aria-hidden />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDownIcon
          className={cn("size-4 shrink-0 transition-transform", (open || childActive) && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1 pt-1 pl-6">
        {group.children.map((child) => {
          const active = pathname === child.href;
          const ChildIcon = child.icon;

          return (
            <Link
              key={child.href}
              href={child.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-secondary-foreground border-primary border-l-4 pl-2.5 font-semibold"
                  : "text-secondary-foreground/75 hover:bg-white/10 hover:text-secondary-foreground",
              )}
            >
              <ChildIcon className={cn("size-4", active && "text-primary")} aria-hidden />
              {child.label}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
