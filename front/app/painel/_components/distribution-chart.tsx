"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

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
  /**
   * "pie" só vale fora do comparativo entre edições: com uma série por
   * edição não há como uma pizza representar as fatias, e a pizza cai de
   * volta para barra — mesma postura do resto do componente diante de um
   * estado sem mockup (observação do time, 2026-08-21): gênero e etnia só
   * viram pizza quando a métrica é de uma edição só.
   */
  variant?: "bar" | "pie";
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
export function DistributionChart({ items, labelOf, horizontal = false, variant = "bar" }: DistributionChartProps) {
  const editions = editionsIn(items);
  const comparing = editions.length > 0;

  if (variant === "pie" && !comparing) {
    return <PieDistribution items={items} labelOf={labelOf} />;
  }

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
 * Uma cor por FATIA — ao contrário da barra em modo soma, que é
 * monocromática de propósito (comentário acima). Numa pizza a cor por
 * categoria não sugere ranking nenhum: é só a legenda visual da fatia,
 * exatamente como cor por edição no comparativo das barras. Por isso
 * `var(--chart-N)` cicla livremente aqui.
 *
 * `slug` (não o rótulo) é a chave de série: rótulos como "Prefiro não
 * informar" têm espaço, o que quebraria `--color-${chave}` se ela fosse
 * usada num nome de propriedade CSS. O `ChartConfig` só precisa do rótulo —
 * a cor de cada fatia vem direto da `Cell`, e a legenda a herda do próprio
 * gráfico, não do `ChartConfig`.
 */
function PieDistribution({
  items,
  labelOf,
}: {
  items: DistributionItem[];
  labelOf: (key: string | number) => string;
}) {
  const data = items.map((item) => ({
    slug: String(item.key),
    label: labelOf(item.key),
    count: item.count,
  }));

  const config: ChartConfig = Object.fromEntries(data.map((entry) => [entry.slug, { label: entry.label }]));

  return (
    <ChartContainer config={config} className="aspect-auto w-full [&_.recharts-pie-label-text]:fill-foreground" style={{ height: 260 }}>
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="slug" hideLabel />} />
        <Pie data={data} dataKey="count" nameKey="slug" outerRadius={90} strokeWidth={2}>
          {data.map((entry, index) => (
            <Cell key={entry.slug} fill={`var(--chart-${(index % 5) + 1})`} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="slug" />} />
      </PieChart>
    </ChartContainer>
  );
}

/**
 * As edições saem dos próprios itens, na ordem em que a API as devolveu —
 * mais recente primeiro. Um `Map` porque a mesma edição aparece em todos os
 * itens, e a legenda precisa dela uma vez só.
 */
export function editionsIn(items: DistributionItem[]): { id: string; label: string }[] {
  const editions = new Map<string, string>();

  for (const item of items) {
    for (const entry of item.byEdition ?? []) {
      editions.set(entry.process.id, entry.process.label);
    }
  }

  return [...editions].map(([id, label]) => ({ id, label }));
}
