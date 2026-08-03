"use client";

import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRegistration } from "../_context/registration-context";

export default function SucessoPage() {
  const router = useRouter();
  const { registered } = useRegistration();

  // O estado da inscrição vive só em memória (FEAT-0001-UI v3.0, seção 8.2):
  // num F5 aqui não há o que exibir e o candidato volta ao início. A inscrição
  // em si já está gravada — refazer o wizard cairia em E1 (email já cadastrado).
  useEffect(() => {
    if (!registered) {
      router.replace("/inscricao");
    }
  }, [registered, router]);

  if (!registered) return null;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
      <div className="bg-success/10 text-success flex size-14 items-center justify-center rounded-full">
        <CheckIcon className="size-7" />
      </div>
      <div>
        <p className="text-primary font-heading text-sm font-semibold tracking-wide uppercase">
          CIMATEC Jr.
        </p>
        <h1 className="font-heading mt-1 text-2xl font-semibold">Inscrição concluída!</h1>
        <p className="text-muted-foreground mt-2 text-sm text-balance">
          Sua inscrição foi registrada no sistema da CIMATEC Jr. Não é preciso fazer mais nada —
          guarde a data da seleção e leve 1kg de alimento não perecível no dia.
        </p>
      </div>
      <div className="border-border bg-card mt-2 w-full rounded-lg border p-4 text-left text-sm">
        <p className="text-muted-foreground">Nome</p>
        <p className="font-medium">{registered.name}</p>
        <p className="text-muted-foreground mt-3">E-mail</p>
        <p className="font-medium">{registered.email}</p>
      </div>
    </div>
  );
}
