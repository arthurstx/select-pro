import { redirect } from "next/navigation";

/**
 * FEAT-0018 — "Grupos" virou um grupo de nav com sub-rotas (online/presencial), sem página
 * própria. `/painel/grupos` (link direto, favorito antigo etc.) cai na online por padrão.
 */
export default function GruposPage() {
  redirect("/painel/grupos/online");
}
