import { AuthGuard } from "@/components/auth/auth-guard";
import { PainelSidebar } from "@/components/painel/painel-sidebar";
import { PainelTopBar } from "@/components/painel/painel-topbar";

import { RouteRoleGuard } from "./_components/role-guard";

/**
 * Área logada. Sidebar (desktop) e topbar com a mesma nav em gaveta (mobile)
 * são compartilhadas por toda rota sob `/painel`.
 *
 * O `RouteRoleGuard` envolve só o miolo, não a casca: quem cai numa rota que
 * seu papel não alcança precisa da sidebar para sair dela.
 */
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen md:flex">
        <PainelSidebar />
        <div className="flex min-h-screen flex-1 flex-col md:ml-64">
          <PainelTopBar />
          <main className="flex-1">
            <RouteRoleGuard>{children}</RouteRoleGuard>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
