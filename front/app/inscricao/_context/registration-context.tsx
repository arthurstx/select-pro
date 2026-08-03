"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PreRegisterRequest } from "shared";

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

/** Chave usada no sessionStorage — só as respostas do wizard, nunca `pending`/`confirmed`. */
const ANSWERS_STORAGE_KEY = "inscricao:wizard-answers";

interface RegistrationContextValue {
  /** Respostas acumuladas das etapas 1-5 do wizard (FEAT-0001-UI v2.0, seção 8.1). */
  answers: Partial<PreRegisterRequest>;
  /** `true` assim que a leitura do sessionStorage (efeito de montagem) terminar. */
  isHydrated: boolean;
  setStepData: (partial: Partial<PreRegisterRequest>) => void;
  /** Limpa só as respostas do wizard (sessionStorage), sem tocar em `pending`/`confirmed`. */
  clearAnswers: () => void;
  pending: PendingRegistration | null;
  confirmed: ConfirmedCandidate | null;
  setPending: (data: PendingRegistration) => void;
  setConfirmed: (data: ConfirmedCandidate) => void;
  reset: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(null);

/**
 * Duas políticas de estado distintas (FEAT-0001-UI v2.0, seção 8):
 *
 * - `answers` (respostas do wizard): contexto + espelhado em `sessionStorage`,
 *   para sobreviver a um F5 em qualquer uma das 6 etapas. Não é dado sensível
 *   de posse/identidade — é só o que o próprio candidato acabou de digitar.
 * - `pending`/`confirmed`: **apenas em memória** (useState), nunca em storage.
 *   `pendingId` é o token de posse temporário citado em FEAT-0001 seção 13 —
 *   perder o estado no F5 é o comportamento aceito pela spec (o candidato é
 *   redirecionado para a etapa 1, mas as respostas do wizard sobrevivem).
 */
export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<Partial<PreRegisterRequest>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [pending, setPendingState] = useState<PendingRegistration | null>(null);
  const [confirmed, setConfirmedState] = useState<ConfirmedCandidate | null>(null);

  // Hidrata do sessionStorage só depois do primeiro render (evita mismatch de
  // SSR — sessionStorage não existe no servidor). Não é estado derivado de
  // props/state do React sendo recalculado; é a sincronização única e
  // intencional com uma fonte externa (sessionStorage) logo após montar, um
  // dos poucos casos em que a própria documentação do React recomenda
  // `setState` dentro de um efeito.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ANSWERS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratação única de fonte externa (sessionStorage), não estado derivado
      if (raw) setAnswers(JSON.parse(raw) as Partial<PreRegisterRequest>);
    } catch {
      // sessionStorage indisponível (modo privado, etc.) — segue com o wizard em memória.
    } finally {
      setIsHydrated(true);
    }
  }, []);

  const setStepData = useCallback((partial: Partial<PreRegisterRequest>) => {
    setAnswers((prev) => {
      const next = { ...prev, ...partial };
      try {
        sessionStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Idem — se não for possível persistir, o wizard segue funcionando só em memória.
      }
      return next;
    });
  }, []);

  const clearAnswers = useCallback(() => {
    setAnswers({});
    try {
      sessionStorage.removeItem(ANSWERS_STORAGE_KEY);
    } catch {
      // Nada a fazer — não há o que limpar se o storage já não estava acessível.
    }
  }, []);

  const setPending = useCallback((data: PendingRegistration) => {
    setPendingState(data);
  }, []);

  const setConfirmed = useCallback((data: ConfirmedCandidate) => {
    setConfirmedState(data);
  }, []);

  const reset = useCallback(() => {
    setAnswers({});
    setPendingState(null);
    setConfirmedState(null);
    try {
      sessionStorage.removeItem(ANSWERS_STORAGE_KEY);
    } catch {
      // Nada a fazer — não há o que limpar se o storage já não estava acessível.
    }
  }, []);

  const value = useMemo(
    () => ({
      answers,
      isHydrated,
      setStepData,
      clearAnswers,
      pending,
      confirmed,
      setPending,
      setConfirmed,
      reset,
    }),
    [answers, isHydrated, setStepData, clearAnswers, pending, confirmed, setPending, setConfirmed, reset],
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
