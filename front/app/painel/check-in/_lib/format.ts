/** Iniciais para o avatar — "Ana Maria Silveira" -> "AM". Nunca mais de 2 letras (mockup do Stitch). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();

  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** "4º Semestre" — o mockup escreve por extenso, não "4º sem" abreviado (variante desktop). */
export function semesterLabel(semester: number): string {
  return `${semester}º Semestre`;
}
