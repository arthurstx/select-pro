import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCardSkeleton } from "../_components/auth-card-skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Acessar Conta | CIMATEC jr.",
  description: "Acesse o portal de gestão técnica da CIMATEC jr.",
};

export default function LoginPage() {
  // `LoginForm` lê a query string (o aviso deixado por outra tela), o que exige
  // fronteira de Suspense para o restante da rota continuar pré-renderizável.
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
