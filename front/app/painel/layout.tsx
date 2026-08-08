import { AuthGuard } from "@/components/auth/auth-guard";

/**
 * Área logada — **placeholder**. O dashboard de verdade pertence a outras specs
 * (FEAT-0003-UI, seção 9); o que existe aqui é o destino de cadastro e login e o
 * lugar onde o guard e a reidratação de sessão são exercitados.
 */
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
