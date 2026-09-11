"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react";

import { formatDay, formatNumber } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Chart colours for the admin console.
 *
 * The app's own `--chart-1..5` tokens are a greyscale ramp with identical
 * values in both themes, so its darker steps disappear against the dark
 * surface. These two slots are picked instead: slot 1 is the brand teal
 * stepped into the lightness band each theme needs, slot 2 is the warm hue
 * that separates from it under red/green colour blindness. Both were checked
 * against the light (#ffffff) and dark (#171717) card surfaces for lightness,
 * chroma, colour-blind separation and 3:1 contrast.
 *
 * Series are assigned slots in a fixed order and never cycled — two is the
 * most any chart here plots, and a third measure gets its own chart rather
 * than a third colour.
 */
export const SERIES_TEAL = { light: "#038d84", dark: "#00968b" } as const;
export const SERIES_ORANGE = { light: "#eb6834", dark: "#d95926" } as const;

type Slot = "teal" | "orange";

const SLOT_THEME: Record<Slot, { light: string; dark: string }> = {
  teal: SERIES_TEAL,
  orange: SERIES_ORANGE,
};

export type Series = {
  /** Key on each row of `data`. */
  key: string;
  label: string;
  slot: Slot;
};

function configFor(series: Series[]): ChartConfig {
  return Object.fromEntries(
    series.map((item) => [
      item.key,
      { label: item.label, theme: SLOT_THEME[item.slot] },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/** One headline number. `value` of `undefined` renders the loading state. */
export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string | undefined;
  hint?: string;
  icon: IconSvgElement;
}) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <HugeiconsIcon
            icon={icon}
            className="size-4 text-muted-foreground"
            strokeWidth={2}
          />
        </div>
        {value === undefined ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <CardTitle className="text-2xl tabular-nums">
            {typeof value === "number" ? formatNumber(value) : value}
          </CardTitle>
        )}
        <p className="text-xs text-muted-foreground">{hint ?? " "}</p>
      </CardHeader>
    </Card>
  );
}

/** A chart in a card, with its own loading and empty states. */
function ChartCard({
  title,
  description,
  loading,
  empty,
  children,
  footer,
}: {
  title: string;
  description: string;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : empty ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            Nothing to chart yet.
          </div>
        ) : (
          children
        )}
        {footer && (
          <p className="pt-3 text-xs text-muted-foreground">{footer}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

export type DailyRow = { date: number } & Record<string, number>;

/**
 * Daily counts over time. One `Series` per measure — but only ever measures of
 * the same kind and scale, since a second y-axis is never the answer. A single
 * series carries no legend: the card title already names what is plotted.
 */
export function DailyChart({
  title,
  description,
  data,
  series,
  footer,
}: {
  title: string;
  description: string;
  data: DailyRow[] | undefined;
  series: Series[];
  footer?: React.ReactNode;
}) {
  const config = React.useMemo(() => configFor(series), [series]);
  const total = (data ?? []).reduce(
    (sum, row) => sum + series.reduce((n, s) => n + (row[s.key] ?? 0), 0),
    0,
  );

  return (
    <ChartCard
      title={title}
      description={description}
      loading={data === undefined}
      empty={total === 0}
      footer={footer}
    >
      <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
        <AreaChart data={data ?? []} margin={{ left: 4, right: 8, top: 4 }}>
          <defs>
            {series.map((item) => (
              <linearGradient
                key={item.key}
                id={`fill-${item.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={`var(--color-${item.key})`}
                  stopOpacity={0.14}
                />
                <stop
                  offset="100%"
                  stopColor={`var(--color-${item.key})`}
                  stopOpacity={0.02}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
            tickFormatter={(value: number) => formatDay(value)}
          />
          <YAxis
            width={40}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(value: number) => formatNumber(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatDay(Number(value))}
              />
            }
          />
          {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          {series.map((item) => (
            <Area
              key={item.key}
              dataKey={item.key}
              type="monotone"
              stroke={`var(--color-${item.key})`}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#fill-${item.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
}

export type CategoryRow = { label: string; value: number };

/**
 * One measure across a handful of named categories. Every bar wears the same
 * colour — the category is already named on the axis, so a second colour would
 * encode nothing. `orientation="horizontal"` puts the names down the side,
 * which is what long names (workspaces) need.
 */
export function CategoryChart({
  title,
  description,
  data,
  valueLabel,
  orientation = "vertical",
  slot = "teal",
  footer,
}: {
  title: string;
  description: string;
  data: CategoryRow[] | undefined;
  valueLabel: string;
  orientation?: "vertical" | "horizontal";
  slot?: Slot;
  footer?: React.ReactNode;
}) {
  const config: ChartConfig = React.useMemo(
    () => ({ value: { label: valueLabel, theme: SLOT_THEME[slot] } }),
    [valueLabel, slot],
  );
  const rows = data ?? [];
  const horizontal = orientation === "horizontal";
  const height = horizontal ? Math.max(160, rows.length * 34 + 24) : 220;

  return (
    <ChartCard
      title={title}
      description={description}
      loading={data === undefined}
      empty={rows.every((row) => row.value === 0)}
      footer={footer}
    >
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height }}
      >
        <BarChart
          data={rows}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={
            horizontal
              ? { left: 4, right: 24, top: 4 }
              : { left: 4, right: 8, top: 4 }
          }
        >
          <CartesianGrid
            horizontal={!horizontal}
            vertical={horizontal}
            strokeDasharray=""
          />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={(value: number) => formatNumber(value)}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={132}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                width={40}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={(value: number) => formatNumber(value)}
              />
            </>
          )}
          <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            maxBarSize={24}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Helpers the pages share
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * A clock reading that only changes once an hour.
 *
 * `admin:activity` takes the current time as an argument because Convex
 * queries are not rerun when the clock advances. Rounding keeps that argument
 * stable, so the subscription is not torn down on every render.
 */
export function useHourlyNow(): number {
  const [now, setNow] = React.useState(
    () => Math.floor(Date.now() / HOUR) * HOUR,
  );
  React.useEffect(() => {
    const id = setInterval(
      () => setNow(Math.floor(Date.now() / HOUR) * HOUR),
      HOUR,
    );
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Buckets timestamps into the same daily grid `admin:activity` uses, so a page
 * holding a list it already fetched can chart it without a second query.
 */
export function bucketByDay(
  timestamps: number[],
  now: number,
  days: number,
): DailyRow[] {
  const end = Math.floor(now / DAY) * DAY + DAY;
  const start = end - days * DAY;
  const counts = new Array<number>(days).fill(0);
  for (const timestamp of timestamps) {
    const bucket = Math.floor((timestamp - start) / DAY);
    if (bucket >= 0 && bucket < days) counts[bucket] += 1;
  }
  return counts.map((count, index) => ({
    date: start + index * DAY,
    count,
  }));
}

/** Windows the admin charts offer. */
export const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const;
