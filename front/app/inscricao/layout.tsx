"use client";

import { RegistrationProvider } from "./_context/registration-context";

export default function InscricaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RegistrationProvider>
      <div className="flex min-h-screen w-full flex-col">
        <header className="border-border w-full border-b bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-4">
            <span className="font-heading text-foreground text-lg font-semibold tracking-tight">
              SelectPro
            </span>
          </div>
        </header>

        <main className="flex w-full flex-1 items-center justify-center px-1 py-10 sm:px-4 sm:py-16">
          {children}
        </main>

        <footer className="border-border w-full border-t bg-white">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 text-sm sm:flex-row">
            <span className="text-muted-foreground">
              CIMATEC Jr © 2026 — Processo Seletivo
            </span>
            <a
              href="#"
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Dúvidas? Entre em contato
            </a>
          </div>
        </footer>
      </div>
    </RegistrationProvider>
  );
}
