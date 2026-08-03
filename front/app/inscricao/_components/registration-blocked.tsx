"use client";

import { AlertTriangleIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { useRegistration } from "../_context/registration-context";

/**
 * Estado de bloqueio compartilhado para os cenários em que a tela de
 * Verificação não tem como corrigir o problema (FEAT-0001-UI, seção 7):
 * E5 (OTC expirado), E9 (excesso de tentativas) e E10 (conflito de
 * email/telefone só detectado na confirmação — não há campo aqui para
 * corrigi-lo). Único caminho: reiniciar um novo pré-registro completo.
 */
export function RegistrationBlocked({ message }: { message: string }) {
  const router = useRouter();
  const { reset } = useRegistration();

  function handleRestart() {
    reset();
    router.push("/inscricao");
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
        <AlertTriangleIcon className="size-6" />
      </div>
      <div>
        <h2 className="font-heading text-lg font-semibold">Não foi possível confirmar</h2>
        <p className="text-muted-foreground mt-1 text-sm">{message}</p>
      </div>
      <Button onClick={handleRestart} className="mt-2">
        Reiniciar inscrição
      </Button>
    </div>
  );
}
