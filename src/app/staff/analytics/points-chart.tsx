"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { formatPoints } from "@/lib/format";

/**
 * Daily points issued vs redeemed: grouped columns, one shared y-axis (same unit).
 * Specs from the dataviz skill: <=24px columns, 4px rounded data-end square at the
 * baseline, 2px surface gap between paired bars, hairline grid, legend + table view,
 * per-day hover/focus tooltip listing both series, text in text tokens only.
 */

export interface DailyPoint {
  day: string; // YYYY-MM-DD (IST)
  issued: number;
  redeemed: number;
}

const SERIES = [
  { key: "issued", label: "Issued", color: "var(--viz-series-1)" },
  { key: "redeemed", label: "Redeemed", color: "var(--viz-series-2)" },
] as const;

const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 48 };
const dayLabel = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

/** Clean tick values: 0 and 3–5 round steps covering the max. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v));
  if ((ticks.at(-1) ?? 0) < max) ticks.push(Math.round((ticks.at(-1) ?? 0) + step));
  return ticks;
}

/** Column with a 4px rounded top (data end) and square base. */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function PointsChart({ data }: { data: DailyPoint[] }) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Draw at the container's real pixel width so 11px text stays 11px (a scaled
  // viewBox would blow labels up on desktop and shrink them on phones).
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const geo = useMemo(() => {
    const max = Math.max(1, ...data.flatMap((d) => [d.issued, d.redeemed]));
    const ticks = niceTicks(max);
    const top = ticks.at(-1) ?? max;
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const band = innerW / Math.max(1, data.length);
    const gap = 2;
    const barW = Math.max(2, Math.min(24, (band * 0.7 - gap) / 2));
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
    const labelEvery = Math.max(1, Math.ceil(data.length / 7));
    return { ticks, innerW, innerH, band, gap, barW, y, labelEvery };
  }, [data, width]);

  const activePoint = active === null ? null : data[active];
  const tooltipLeft =
    active === null
      ? 0
      : PAD.left + geo.band * active + geo.band / 2 - (active > data.length / 2 ? 170 : -10);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={wrapRef} className="relative w-full">
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${String(width)} ${String(H)}`}
          className="block overflow-visible"
          role="img"
          aria-labelledby={titleId}
          onPointerLeave={() => {
            setActive(null);
          }}
        >
          <title id={titleId}>
            Points issued and redeemed per day. Use Tab to step through days, or open the data table
            below.
          </title>
          {geo.ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={geo.y(t)}
                y2={geo.y(t)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={geo.y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {t >= 10_000 ? compact.format(t) : t.toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + geo.band * i + geo.band / 2;
            const x1 = cx - geo.barW - geo.gap / 2;
            const x2 = cx + geo.gap / 2;
            const base = PAD.top + geo.innerH;
            const dim = active !== null && active !== i;
            return (
              <g
                key={d.day}
                tabIndex={0}
                role="img"
                aria-label={`${dayLabel.format(new Date(d.day))}: ${formatPoints(d.issued)} issued, ${formatPoints(d.redeemed)} redeemed`}
                onPointerEnter={() => {
                  setActive(i);
                }}
                onFocus={() => {
                  setActive(i);
                }}
                onBlur={() => {
                  setActive(null);
                }}
                className="outline-none focus-visible:[&>rect:first-child]:fill-[color-mix(in_oklch,var(--foreground),transparent_92%)]"
                style={{ opacity: dim ? 0.45 : 1, transition: "opacity 120ms" }}
              >
                {/* Hit target: the whole day band, taller than the marks. */}
                <rect
                  x={PAD.left + geo.band * i}
                  y={PAD.top}
                  width={geo.band}
                  height={geo.innerH}
                  fill={
                    active === i
                      ? "color-mix(in oklch, var(--foreground), transparent 95%)"
                      : "transparent"
                  }
                />
                <path
                  d={columnPath(x1, geo.y(d.issued), geo.barW, base - geo.y(d.issued))}
                  fill={SERIES[0].color}
                />
                <path
                  d={columnPath(x2, geo.y(d.redeemed), geo.barW, base - geo.y(d.redeemed))}
                  fill={SERIES[1].color}
                />
                {i % geo.labelEvery === 0 ? (
                  <text
                    x={cx}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {dayLabel.format(new Date(d.day))}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + geo.innerH}
            y2={PAD.top + geo.innerH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
        </svg>
        {activePoint ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 w-40 rounded-lg border bg-popover p-2.5 text-xs shadow-md"
            style={{ left: `${String((tooltipLeft / width) * 100)}%` }}
          >
            <p className="mb-1.5 text-muted-foreground">
              {dayLabel.format(new Date(activePoint.day))}
            </p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <strong className="font-semibold text-foreground tabular-nums">
                  {activePoint[s.key].toLocaleString("en-IN")}
                </strong>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Show data table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">Points issued and redeemed per day</caption>
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  Day
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  Issued
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  Redeemed
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day} className="border-t">
                  <th scope="row" className="px-3 py-1 font-normal">
                    {dayLabel.format(new Date(d.day))}
                  </th>
                  <td className="px-3 py-1 text-right">{d.issued.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-1 text-right">{d.redeemed.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
