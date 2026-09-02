import type { Metadata } from "next";

import { SignupDecisionScreen } from "./signup-decision-screen";

export const metadata: Metadata = {
  title: "Solicitação de Acesso | CIMATEC jr.",
  description: "Aprove ou recuse uma solicitação de cadastro pendente.",
};

export default async function SolicitacaoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <SignupDecisionScreen token={token} />;
}
