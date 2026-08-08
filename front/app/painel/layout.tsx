import { AuthGuard } from "@/components/auth/auth-guard";

/** Área logada — placeholder. O dashboard de verdade pertence a outras specs. */
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
