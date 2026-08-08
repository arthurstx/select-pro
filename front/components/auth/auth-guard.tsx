"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";
import { AUTH_ROUTES } from "@/lib/auth/routes";

/**
 * ⚠️ Isto é experiência do usuário, não segurança — o cookie de refresh
 * pertence ao domínio da API e o `middleware.ts` do Next não o enxerga. A
 * barreira real é a API respondendo 401.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(AUTH_ROUTES.login);
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3"
        aria-busy="true"
      >
        <Spinner className="text-primary size-6" />
        <p className="text-muted-foreground text-sm">Carregando sua sessão…</p>
      </div>
    );
  }

  return <>{children}</>;
}
