import { AuthGuard } from "@/components/auth/auth-guard";
import { PainelSidebar } from "@/components/painel/painel-sidebar";
import { PainelTopBar } from "@/components/painel/painel-topbar";

/** Área logada. A sidebar (desktop) e a topbar (mobile) são compartilhadas por toda rota sob `/painel`. */
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen md:flex">
        <PainelSidebar />
        <div className="flex min-h-screen flex-1 flex-col md:ml-64">
          <PainelTopBar />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
