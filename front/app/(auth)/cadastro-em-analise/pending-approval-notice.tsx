"use client";

import { ClockIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AUTH_ROUTES } from "@/lib/auth/routes";

import { AuthCard } from "../_components/auth-card";

/**
 * Destino de `POST /auth/register` quando o membro é pós-júnior ou trainee
 * (FEAT-0008, US1) — nenhuma conta foi criada, então não há sessão nem
 * redirecionamento automático. O email é opcional na URL, só para
 * personalizar a mensagem; a tela funciona sem ele (navegação direta).
 */
export function PendingApprovalNotice() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <AuthCard title="Cadastro em análise">
      <div className="flex flex-col items-center gap-5 py-2 text-center">
        <div className="bg-muted flex size-16 items-center justify-center rounded-full">
          <ClockIcon className="text-muted-foreground size-7" aria-hidden />
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed">
          Recebemos seu cadastro{email && <> para <strong className="text-foreground">{email}</strong></>}.
          Como seu vínculo com a empresa está fora do quadro de efetivados, um administrador
          precisa aprovar o acesso antes que você possa entrar.
        </p>

        <p className="text-muted-foreground text-sm leading-relaxed">
          Você vai receber um email assim que houver uma decisão.
        </p>

        <Button asChild variant="outline" className="mt-2 w-full">
          <Link href={AUTH_ROUTES.login}>Voltar para o início</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
