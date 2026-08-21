/**
 * `createdAt` chega do D1 como `"AAAA-MM-DD HH:MM:SS"` — **não** ISO-8601.
 * `new Date(...)` sobre esse formato é comportamento de implementação: alguns
 * motores leem como local, outros recusam. Fatiar a string é determinístico e
 * suficiente para exibir uma data que já é local por origem (o servidor grava
 * em UTC via `CURRENT_TIMESTAMP`, e o painel é usado no mesmo fuso).
 */
export function formatDate(value: string): string {
  const [date] = value.split(" ");
  const [year, month, day] = (date ?? "").split("-");
  if (!year || !month || !day) return value;

  return `${day}/${month}/${year}`;
}

export function formatDateTime(value: string): string {
  const [, time] = value.split(" ");
  const hourAndMinute = time?.slice(0, 5);

  return hourAndMinute ? `${formatDate(value)} às ${hourAndMinute}` : formatDate(value);
}

/** Data de hoje em `AAAA-MM-DD`, para o `max` dos campos de intervalo. */
export function todayAsInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/** "4º Semestre" — mesmo rótulo por extenso do check-in. */
export function semesterLabel(semester: number): string {
  return `${semester}º Semestre`;
}

/** Iniciais para o avatar — "Ana Maria Silveira" -> "AM". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();

  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
