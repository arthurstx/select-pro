"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser, LoginDTO, MemberProfileSummary, RegisterMemberDTO } from "shared";

import { fetchCurrentUser, login, logout, registerMember } from "./auth-api";
import { AUTH_ROUTES, LoginNotice, loginWithNotice } from "./routes";
import {
  clearAccessToken,
  onSessionEnd,
  refreshSession,
  setAccessToken,
} from "./session";

/**
 * `loading` é o estado do boot (seção 4.5) e **não é opcional**: enquanto o
 * `/auth/refresh` não responde, nenhuma rota protegida decide nada — nem
 * renderiza, nem redireciona. Sem ele, todo reload da área logada pisca a tela
 * de login antes de reconstruir a sessão.
 */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Só existe depois de um `GET /auth/me` — o login/cadastro não devolvem perfil. */
  profile: MemberProfileSummary | null;
  signIn: (payload: LoginDTO) => Promise<void>;
  signUp: (payload: RegisterMemberDTO) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<MemberProfileSummary | null>(null);

  // Reidratação no boot (seção 4.5): o access token morreu no reload, mas o
  // cookie de refresh sobreviveu. Ele é quem reconstrói a sessão.
  //
  // Em desenvolvimento o Strict Mode roda este efeito duas vezes — e as duas
  // execuções caem no mesmo `refreshSession()` em curso, resultando em UMA
  // chamada de rede. É o single-flight da seção 8.3 valendo na prática.
  useEffect(() => {
    let cancelled = false;

    async function rehydrate() {
      const outcome = await refreshSession();

      if (outcome.status !== "renewed") {
        if (!cancelled) setStatus("unauthenticated");
        return;
      }

      try {
        const me = await fetchCurrentUser();
        if (cancelled) return;

        const { profile: memberProfile, ...identity } = me;
        setUser(identity);
        setProfile(memberProfile);
        setStatus("authenticated");
      } catch {
        // Renovou mas não conseguiu ler o usuário: segue como visitante em vez
        // de fingir uma sessão pela metade.
        if (cancelled) return;
        clearAccessToken();
        setStatus("unauthenticated");
      }
    }

    void rehydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sessão encerrada por decisão do backend (seção 7.5).
  useEffect(
    () =>
      onSessionEnd(() => {
        setUser(null);
        setProfile(null);
        setStatus("unauthenticated");
        router.replace(loginWithNotice(LoginNotice.SESSION_EXPIRED));
      }),
    [router],
  );

  const signIn = useCallback(async (payload: LoginDTO) => {
    const session = await login(payload);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setProfile(null);
    setStatus("authenticated");
  }, []);

  const signUp = useCallback(async (payload: RegisterMemberDTO) => {
    const session = await registerMember(payload);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setProfile(null);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    clearAccessToken();
    setUser(null);
    setProfile(null);
    setStatus("unauthenticated");
    router.replace(AUTH_ROUTES.login);
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, profile, signIn, signUp, signOut }),
    [status, user, profile, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return context;
}
