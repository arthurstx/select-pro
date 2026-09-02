import { AuthGuard } from "@/components/auth/auth-guard";
import { PainelMobileNav } from "@/components/painel/painel-mobile-nav";
import { PainelSidebar } from "@/components/painel/painel-sidebar";
import { PainelTopBar } from "@/components/painel/painel-topbar";

/**
 * Área logada. Sidebar (desktop) e topbar+nav inferior (mobile) são
 * compartilhadas por toda rota sob `/painel`.
 */
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen md:flex">
        <PainelSidebar />
        <div className="flex min-h-screen flex-1 flex-col md:ml-64">
          <PainelTopBar />
          {/* `pb-16` só no mobile: espaço pra nav inferior fixa não cobrir o fim do conteúdo. */}
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
        </div>
        <PainelMobileNav />
      </div>
    </AuthGuard>
  );
}
