import { redirect } from "next/navigation";

/**
 * FEAT-0019 — "Check-in" virou duas rotas por modalidade, sem página própria.
 * `/painel/check-in` (link direto, favorito antigo etc.) cai na presencial por padrão.
 */
export default function CheckInPage() {
  redirect("/painel/check-in/presencial");
}
