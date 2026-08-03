"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface PendingRegistration {
  pendingId: string;
  expiresAt: string;
}

interface ConfirmedCandidate {
  id: string;
  name: string;
  email: string;
  updatedAt: string;
}

interface RegistrationContextValue {
  pending: PendingRegistration | null;
  confirmed: ConfirmedCandidate | null;
  setPending: (data: PendingRegistration) => void;
  setConfirmed: (data: ConfirmedCandidate) => void;
  reset: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(null);

/**
 * Estado em memória apenas (useState) — nunca localStorage/sessionStorage/query
 * string (FEAT-0001-UI, seção 8). Perder o estado no F5 é comportamento aceito
 * pela spec: as telas que dependem dele redirecionam para `/inscricao`.
 */
export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPendingState] = useState<PendingRegistration | null>(null);
  const [confirmed, setConfirmedState] = useState<ConfirmedCandidate | null>(null);

  const setPending = useCallback((data: PendingRegistration) => {
    setPendingState(data);
  }, []);

  const setConfirmed = useCallback((data: ConfirmedCandidate) => {
    setConfirmedState(data);
  }, []);

  const reset = useCallback(() => {
    setPendingState(null);
    setConfirmedState(null);
  }, []);

  const value = useMemo(
    () => ({ pending, confirmed, setPending, setConfirmed, reset }),
    [pending, confirmed, setPending, setConfirmed, reset],
  );

  return <RegistrationContext.Provider value={value}>{children}</RegistrationContext.Provider>;
}

export function useRegistration() {
  const context = useContext(RegistrationContext);
  if (!context) {
    throw new Error("useRegistration deve ser usado dentro de RegistrationProvider");
  }
  return context;
}
