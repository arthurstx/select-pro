"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** Item de qualquer uma das cinco distribuições — a forma é a mesma para todas. */
export interface DistributionItem {
  key: string | number;
  count: number;
  byEdition?: { process: { id: string; label: string }; count: number }[];
}

interface DistributionChartProps {
  items: DistributionItem[];
  /** Slug -> rótulo. Vem de `COURSE_LABELS` e companhia, nunca reescrito aqui. */
  labelOf: (key: string | number) => string;
  /** Barras deitadas quando os rótulos são longos (curso, origem). */
  horizontal?: boolean;
}

/**
 * **Uma série, uma cor.** No modo "soma" há uma série só, e ela é monocromática:
 * o mockup usava três tons sem critério, com um curso de valor maior
 * aparecendo mais claro que um de valor menor — o que sugere um ranking que
 * não existe (FEAT-0007-UI, seção 12).
 *
 * No comparativo, cor = EDIÇÃO. É a única situação em que mais de uma cor
 * carrega informação.
 */
export function DistributionChart({ items, labelOf, horizontal = false }: DistributionChartProps) {
  const editions = editionsIn(items);
  const comparing = editions.length > 0;

  const config: ChartConfig = comparing
    ? Object.fromEntries(
        editions.map((edition, index) => [
          edition.id,
          { label: edition.label, color: `var(--chart-${(index % 5) + 1})` },
        ]),
      )
    : { count: { label: "Inscritos", color: "var(--chart-1)" } };

  const data = items.map((item) => ({
    label: labelOf(item.key),
    count: item.count,
    ...Object.fromEntries((item.byEdition ?? []).map((entry) => [entry.process.id, entry.count])),
  }));

  const series = comparing ? editions.map((edition) => edition.id) : ["count"];

  // ~34px por barra deitada mantém o rótulo legível sem espremer as barras
  // quando a série tem oito cursos.
  const height = horizontal ? Math.max(160, data.length * 34 + 40) : 240;

  return (
    // `aspect-auto` derruba o `aspect-video` que o `ChartContainer` traz por
    // padrão: com ele, a altura calculada acima seria ignorada e a barra
    // deitada de oito cursos ficaria espremida.
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart
        accessibilityLayer
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={horizontal ? { left: 8, right: 16 } : { top: 8 }}
      >
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              width={150}
              tick={{ fontSize: 12 }}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
          </>
        )}
        <ChartTooltip content={<ChartTooltipContent />} />
        {comparing && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((key) => (
          <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={4} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/**
 * As edições saem dos próprios itens, na ordem em que a API as devolveu —
 * mais recente primeiro. Um `Map` porque a mesma edição aparece em todos os
 * itens, e a legenda precisa dela uma vez só.
 */
function editionsIn(items: DistributionItem[]): { id: string; label: string }[] {
  const editions = new Map<string, string>();

  for (const item of items) {
    for (const entry of item.byEdition ?? []) {
      editions.set(entry.process.id, entry.process.label);
    }
  }

  return [...editions].map(([id, label]) => ({ id, label }));
}
