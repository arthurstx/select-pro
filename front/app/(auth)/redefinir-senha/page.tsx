import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/components/ui/spinner";

import { AuthCard } from "../_components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Definir Nova Senha | CIMATEC jr.",
  description: "Defina uma nova senha para sua conta no portal da CIMATEC jr.",
};

/** Estado "verificando token na URL". */
function CheckingToken() {
  return (
    <AuthCard title="Definir Nova Senha">
      <div className="flex items-center justify-center gap-3 py-6" aria-busy="true">
        <Spinner className="text-primary size-5" />
        <p className="text-muted-foreground text-sm">Verificando seu link…</p>
      </div>
    </AuthCard>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<CheckingToken />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
