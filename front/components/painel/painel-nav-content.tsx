"use client";

import { ChevronDownIcon, ListChecksIcon, LogOutIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";
import { asRole, filterNavForRole } from "@/lib/auth/route-roles";
import { cn } from "@/lib/utils";

import { isPainelNavGroup, PAINEL_NAV_ITEMS, type PainelNavGroup, type PainelNavItem } from "./painel-nav";

/**
 * Miolo da navegação da área logada — marca, itens (com os grupos expansíveis)
 * e o rodapé de sair. Vive separado da `PainelSidebar` porque o mobile passou
 * a usar exatamente a mesma navegação, só que dentro de uma gaveta: a barra
 * inferior nasceu com dois destinos e hoje seriam dez itens achatados numa
 * faixa de ~40px, o que deixou de ser navegável.
 *
 * `onNavigate` existe só para o mobile fechar a gaveta ao seguir um link; no
 * desktop não é passado e a sidebar é permanente.
 *
 * A lista é podada pelo papel do usuário: mostrar um destino que a API vai
 * negar com 403 confunde mais do que ajuda. O guard de verdade continua sendo
 * a API — e, para quem digita a URL, o `RouteRoleGuard` no layout.
 */
export function PainelNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const items = useMemo(() => filterNavForRole(PAINEL_NAV_ITEMS, asRole(user?.role)), [user?.role]);

  return (
    <>
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

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3" aria-label="Navegação principal">
        {items.map((item) =>
          isPainelNavGroup(item) ? (
            <NavGroup key={item.label} group={item} pathname={pathname} onNavigate={onNavigate} />
          ) : (
            <NavLink key={item.href} item={item} active={pathname === item.href} onNavigate={onNavigate} />
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
    </>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: PainelNavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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
function NavGroup({
  group,
  pathname,
  onNavigate,
}: {
  group: PainelNavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
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
              onClick={onNavigate}
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
