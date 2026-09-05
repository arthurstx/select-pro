"use client";

import { ShieldAlertIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth/auth-context";
import { asRole, canAccessRoute } from "@/lib/auth/route-roles";

import { ACCESS_DENIED } from "../_lib/error-view";
import { StateMessage } from "./state-message";

/**
 * Barra por papel quem chega numa rota do painel digitando a URL — a sidebar
 * já esconde o que o usuário não pode acessar (`filterNavForRole`), mas o link
 * ainda pode vir de um favorito ou de um colega.
 *
 * ⚠️ Como o `AuthGuard`, isto é experiência, não segurança: a barreira real é o
 * `requireRole` da API. O ganho é a tela negar com uma frase clara em vez de
 * disparar a requisição e cair no erro genérico — envolvendo `children`, a
 * página nem chega a montar, então nenhum `useQuery` dela sai para tomar 403.
 *
 * Roda sempre dentro do `AuthGuard`, que já mostra o spinner de sessão: durante
 * o boot devolvemos `null` em vez da tela de negado, senão ela pisca para quem
 * tem acesso.
 */
export function RouteRoleGuard({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const pathname = usePathname();

  if (status !== "authenticated" || !user) return null;
  if (!canAccessRoute(asRole(user.role), pathname)) return <AccessDeniedScreen />;

  return <>{children}</>;
}

/** Sem botão de ação: a sidebar continua visível e já oferece a saída. */
export function AccessDeniedScreen() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <StateMessage
        icon={<ShieldAlertIcon className="text-muted-foreground size-8" aria-hidden />}
        title={ACCESS_DENIED.title}
        description={ACCESS_DENIED.description}
      />
    </div>
  );
}
