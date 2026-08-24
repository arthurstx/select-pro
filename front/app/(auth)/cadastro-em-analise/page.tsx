import type { Metadata } from "next";
import { Suspense } from "react";

import { Spinner } from "@/components/ui/spinner";

import { AuthCard } from "../_components/auth-card";
import { PendingApprovalNotice } from "./pending-approval-notice";

export const metadata: Metadata = {
  title: "Cadastro em Análise | CIMATEC jr.",
  description: "Seu cadastro foi recebido e aguarda aprovação de um administrador.",
};

function Loading() {
  return (
    <AuthCard title="Cadastro em análise">
      <div className="flex items-center justify-center gap-3 py-6" aria-busy="true">
        <Spinner className="text-primary size-5" />
      </div>
    </AuthCard>
  );
}

export default function CadastroEmAnalisePage() {
  return (
    <Suspense fallback={<Loading />}>
      <PendingApprovalNotice />
    </Suspense>
  );
}
