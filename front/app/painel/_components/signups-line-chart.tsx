"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import { formatDate } from "../_lib/format";
import { editionsIn, type DistributionItem } from "./distribution-chart";

interface SignupsLineChartProps {
  /** `key` é a data (`AAAA-MM-DD`), já vem do backend zero-preenchida dia a dia. */
  items: DistributionItem[];
}

/**
 * "Inscritos por dia" (observação do time, 2026-08-21). Mesmo dado dos
 * outros gráficos — `key`/`count`/`byEdition` — só que em série temporal:
 * o eixo X é cronológico, não categórico, e por isso este componente não
 * reaproveita `DistributionChart` por dentro, embora reaproveite `editionsIn`
 * dele para decidir se compara edições.
 *
 * Os dias sem inscrição já chegam com `count: 0` (é o backend que zero-
 * preenche, não este componente) — sem isso a linha pularia direto de um
 * pico a outro, escondendo os intervalos parados.
 */
export function SignupsLineChart({ items }: SignupsLineChartProps) {
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
    day: formatDate(String(item.key)),
    count: item.count,
    ...Object.fromEntries((item.byEdition ?? []).map((entry) => [entry.process.id, entry.count])),
  }));

  const series = comparing ? editions.map((edition) => edition.id) : ["count"];

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 260 }}>
      <LineChart data={data} margin={{ top: 8, left: 8, right: 16 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {comparing && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={data.length <= 31}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
