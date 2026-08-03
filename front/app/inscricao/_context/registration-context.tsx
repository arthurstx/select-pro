"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { RegisterRequest } from "shared";

interface RegisteredCandidate {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** Chave usada no sessionStorage — só as respostas do wizard, nunca `registered`. */
const ANSWERS_STORAGE_KEY = "inscricao:wizard-answers";

interface RegistrationContextValue {
  /** Respostas acumuladas das etapas 1-5 do wizard (FEAT-0001-UI v3.0, seção 8.1). */
  answers: Partial<RegisterRequest>;
  /** `true` assim que a leitura do sessionStorage (efeito de montagem) terminar. */
  isHydrated: boolean;
  setStepData: (partial: Partial<RegisterRequest>) => void;
  /** Limpa só as respostas do wizard (sessionStorage), sem tocar em `registered`. */
  clearAnswers: () => void;
  registered: RegisteredCandidate | null;
  setRegistered: (data: RegisteredCandidate) => void;
  reset: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(null);

/**
 * Duas políticas de estado distintas (FEAT-0001-UI v3.0, seção 8):
 *
 * - `answers` (respostas do wizard): contexto + espelhado em `sessionStorage`,
 *   para sobreviver a um F5 em qualquer uma das 6 etapas. Não é dado sensível
 *   — é só o que o próprio candidato acabou de digitar.
 * - `registered` (resposta do `POST /candidate/register`): **apenas em memória**,
 *   só para alimentar a tela de sucesso. Não persistir não perde nada: a
 *   inscrição já está gravada no banco e não há área logada para recuperar.
 */
export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<Partial<RegisterRequest>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [registered, setRegisteredState] = useState<RegisteredCandidate | null>(null);

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
      if (raw) setAnswers(JSON.parse(raw) as Partial<RegisterRequest>);
    } catch {
      // sessionStorage indisponível (modo privado, etc.) — segue com o wizard em memória.
    } finally {
      setIsHydrated(true);
    }
  }, []);

  const setStepData = useCallback((partial: Partial<RegisterRequest>) => {
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

  const setRegistered = useCallback((data: RegisteredCandidate) => {
    setRegisteredState(data);
  }, []);

  const reset = useCallback(() => {
    setAnswers({});
    setRegisteredState(null);
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
      registered,
      setRegistered,
      reset,
    }),
    [answers, isHydrated, setStepData, clearAnswers, registered, setRegistered, reset],
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
