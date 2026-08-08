import { ShieldCheckIcon } from "lucide-react";

/**
 * Moldura comum das quatro telas de auth (FEAT-0003-UI, seção 3).
 *
 * O Stitch trazia duas identidades diferentes — login e cadastro com um painel,
 * recuperação com outro (pontilhado, "Sistema Corporativo Restrito"). A seção 12
 * pede para consolidar: existe um painel só, e ele é o mesmo nas quatro telas.
 *
 * O painel some abaixo de `lg` — no mobile ele viraria uma tela inteira de
 * marketing antes do formulário, que é o que os próprios mockups mobile evitam.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <aside className="bg-brand-navy text-brand-navy-foreground relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        {/* Profundidade sutil, sem imagem: mantém o painel leve. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_80%_at_15%_0%,rgba(255,255,255,0.14),transparent_60%)]"
        />

        <div className="relative">
          <span className="font-heading inline-flex rounded-md bg-white/10 px-5 py-3 text-xl font-bold tracking-[0.18em] ring-1 ring-white/15">
            CIMATEC JR
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-heading text-4xl leading-tight font-bold text-balance">
            Excelência em Engenharia e Consultoria.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-white/70">
            Seja bem-vindo ao portal. Sua expertise é o que garante a precisão técnica e a
            qualidade dos nossos projetos institucionais.
          </p>
        </div>

        <p className="relative flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-white/50 uppercase">
          <ShieldCheckIcon className="size-4" aria-hidden />
          Portal de Gestão Técnica
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <p className="font-heading text-primary mb-8 text-center text-2xl font-bold lg:hidden">
            CIMATEC jr.
          </p>

          {children}

          <p className="text-muted-foreground mt-8 text-center text-xs">
            CIMATEC jr © 2026 — Portal de Gestão Técnica
          </p>
        </div>
      </main>
    </div>
  );
}
