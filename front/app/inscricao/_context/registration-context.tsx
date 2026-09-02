"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { RegisterRequest } from "shared";

interface RegisteredCandidate {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/**
 * O sufixo de versão descarta estado antigo em vez de hidratá-lo contra um
 * schema incompatível. Foi bumpado para `v2` na FEAT-0006: quem estivesse com
 * o wizard aberto durante o deploy tinha `gender: "mascu"` gravado aqui, e o
 * valor deixou de existir em `GenderSchema`.
 */
const ANSWERS_STORAGE_KEY = "inscricao:wizard-answers:v2";

interface RegistrationContextValue {
  answers: Partial<RegisterRequest>;
  isHydrated: boolean;
  setStepData: (partial: Partial<RegisterRequest>) => void;
  clearAnswers: () => void;
  registered: RegisteredCandidate | null;
  setRegistered: (data: RegisteredCandidate) => void;
  reset: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(null);

/**
 * `answers` (respostas do wizard): espelhado em `sessionStorage`, sobrevive a
 * um F5 em qualquer etapa. `registered` (resposta do cadastro): só em
 * memória — a inscrição já está gravada no banco, não há área logada.
 */
export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<Partial<RegisterRequest>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [registered, setRegisteredState] = useState<RegisteredCandidate | null>(null);

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
        // segue funcionando só em memória
      }
      return next;
    });
  }, []);

  const clearAnswers = useCallback(() => {
    setAnswers({});
    try {
      sessionStorage.removeItem(ANSWERS_STORAGE_KEY);
    } catch {
      // nada a fazer
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
      // nada a fazer
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
