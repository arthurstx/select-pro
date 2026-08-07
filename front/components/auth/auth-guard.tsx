"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";
import { AUTH_ROUTES } from "@/lib/auth/routes";

/**
 * Guard client-side da área logada (FEAT-0003-UI, seção 8.4).
 *
 * ⚠️ Isto é **experiência do usuário, não segurança**. O `middleware.ts` do Next
 * não conseguiria fazer este trabalho: o cookie de refresh pertence ao domínio
 * da API (Cloudflare), com `Path=/auth`, e nunca é enviado ao domínio do front
 * (Vercel) — o middleware simplesmente não o enxerga. A barreira real é a API
 * respondendo 401, e nenhuma tela protegida deve exibir dado que não tenha
 * vindo de uma chamada autenticada.
 *
 * Enquanto o boot não decide (`loading`), nada é renderizado e nada é
 * redirecionado (seção 5).
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
