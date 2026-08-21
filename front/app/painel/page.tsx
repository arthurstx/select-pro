import type { Metadata } from "next";

import { DashboardScreen } from "./dashboard-screen";

export const metadata: Metadata = {
  title: "Painel | CIMATEC jr.",
};

/**
 * Server Component só pelo `metadata` — a tela em si é cliente (gráficos,
 * filtros, painel lateral). `AuthGuard` já é aplicado pelo layout de
 * `/painel`. Substitui o `SessionSummary` que ocupava esta rota como
 * placeholder desde a FEAT-0003.
 */
export default function PainelPage() {
  return <DashboardScreen />;
}
