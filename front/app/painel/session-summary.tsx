"use client";

import { LogOutIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth/auth-context";

/** Placeholder da área logada: mostra o que a sessão em memória sabe sobre o membro e oferece o logout. */
export function SessionSummary() {
  const { user, profile, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  if (!user) return null;

  return (
    <section className="border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Olá, {user.name}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Sua sessão está ativa. O painel em si ainda será construído.
      </p>

      <dl className="mt-6 grid gap-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Papel</dt>
          <dd className="font-medium">{user.role}</dd>
        </div>
        {profile && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Curso</dt>
              <dd className="font-medium">{profile.course}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Semestre</dt>
              <dd className="font-medium">{profile.semester}</dd>
            </div>
          </>
        )}
      </dl>

      <Button
        variant="outline"
        className="mt-8 w-full"
        disabled={leaving}
        onClick={() => {
          setLeaving(true);
          void signOut();
        }}
      >
        {leaving ? <Spinner aria-hidden /> : <LogOutIcon aria-hidden />}
        Sair da conta
      </Button>
    </section>
  );
}
