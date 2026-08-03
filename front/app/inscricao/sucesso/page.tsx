"use client";

import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRegistration } from "../_context/registration-context";

export default function SucessoPage() {
  const router = useRouter();
  const { confirmed } = useRegistration();

  useEffect(() => {
    if (!confirmed) {
      router.replace("/inscricao");
    }
  }, [confirmed, router]);

  if (!confirmed) return null;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
      <div className="bg-success/10 text-success flex size-14 items-center justify-center rounded-full">
        <CheckIcon className="size-7" />
      </div>
      <div>
        <p className="text-primary font-heading text-sm font-semibold tracking-wide uppercase">
          CIMATEC Jr.
        </p>
        <h1 className="font-heading mt-1 text-2xl font-semibold">Sucesso!</h1>
        <p className="text-muted-foreground mt-2 text-sm text-balance">
          Seu registro foi processado com sucesso no sistema da CIMATEC Jr.
        </p>
      </div>
      <div className="border-border bg-card mt-2 w-full rounded-lg border p-4 text-left text-sm">
        <p className="text-muted-foreground">Nome</p>
        <p className="font-medium">{confirmed.name}</p>
        <p className="text-muted-foreground mt-3">E-mail</p>
        <p className="font-medium">{confirmed.email}</p>
      </div>
    </div>
  );
}
