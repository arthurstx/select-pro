"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { PAINEL_NAV_ITEMS } from "./painel-nav";

/**
 * Nav inferior do mobile — a sidebar (`PainelSidebar`) só aparece em `md+`,
 * e até esta tela a topbar mobile não tinha nenhum jeito de navegar entre
 * `/painel` e `/painel/check-in` além de digitar a URL. Barra fixa embaixo,
 * não gaveta/hambúrguer: só dois destinos, e um menu para dois itens é mais
 * toque do que a própria navegação.
 */
export function PainelMobileNav() {
    const pathname = usePathname();

    return (
        <nav
            aria-label="Navegação principal"
            className="border-border bg-background fixed inset-x-0 bottom-0 z-40 flex border-t md:hidden"
        >
            {PAINEL_NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium",
                            active ? "text-primary" : "text-muted-foreground",
                        )}
                    >
                        <Icon className="size-5" aria-hidden />
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
