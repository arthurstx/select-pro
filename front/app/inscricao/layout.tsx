"use client";

import { RegistrationProvider } from "./_context/registration-context";

export default function InscricaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RegistrationProvider>
      <main className=" flex min-h-screen w-full justify-center items-center px-1 sm:px-4 py-10 sm:py-16">
        {children}
      </main>
    </RegistrationProvider>
  );
}
