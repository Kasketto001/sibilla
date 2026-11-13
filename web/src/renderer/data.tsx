import { useEffect, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import type { NodeOf, Scalar } from "@sibilla/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRender } from "./context";
import { formatValue } from "./format";
import { Loading, NoData, NodeError } from "./states";
import { useOptions } from "./options";
import { useSpecQuery } from "./useSpecQuery";

export function Kpi({ node }: { node: NodeOf<"kpi"> }) {
  const { rows, error, loading } = useSpecQuery(node.query);
  const v = rows?.[0]?.[node.field];
  return (
    <Card size="sm" className="@container">
      <CardHeader>
        <CardDescription>{node.label}</CardDescription>
        {loading ? <Loading className="h-8" /> : error ? <NodeError message={error} /> :
          v === undefined || v === null ? <NoData /> :
          <CardTitle className="truncate font-heading text-xl font-semibold tabular-nums @[13rem]:text-2xl @[16rem]:text-3xl" title={formatValue(v, node.format)}>{formatValue(v, node.format)}</CardTitle>}
      </CardHeader>
    </Card>
  );
}

const BADGE_VARIANT = (v: string) =>
  /annull|rifiut|errore|scadut|bloccat/i.test(v) ? "destructive" : /consegn|complet|attiv|pagat|chius/i.test(v) ? "default" : "secondary";

const NUMERIC = new Set(["number", "currency"]);
const collator = new Intl.Collator("it-IT", { numeric: true, sensitivity: "base" });

function compare(a: Scalar | undefined, b: Scalar | undefined): number {
  if (a == null) return b == null ? 0 : 1; // empty values last
  if (b == null) return -1;
  return typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
}

export function DataTable({ node }: { node: NodeOf<"table"> }) {
  const { rows, error, loading } = useSpecQuery(node.query);
  const { setVar, vars, navigate } = useRender();
  const [sort, setSort] = useState<{ field: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const click = node.rowClick;
  const link = node.rowLink;
  const open = (r: Record<string, Scalar>) => {
    if (click) setVar(click.setVariable, r[click.field] ?? null);
    if (link) navigate?.({
      to: link.to, intent: link.intent, label: String(r[node.columns[0]?.field] ?? node.title ?? link.to),
      params: Object.fromEntries(link.params.map((p) => [p.name, r[p.field] ?? null])),
    });
  };
  const size = Math.max(1, node.pageSize ?? 10);

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows ?? [];
    return [...rows].sort((a, b) => sort.dir * compare(a[sort.field], b[sort.field]));
  }, [rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * size, current * size + size);

  const toggle = (field: string) => {
    setSort((s) => (s?.field === field ? { field, dir: s.dir === 1 ? -1 : 1 } : { field, dir: 1 }));
    setPage(0);
  };

  const body = loading ? <Loading className="h-40" /> : error ? <NodeError message={error} /> : !rows?.length ? <NoData /> : (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            {node.columns.map((c) => {
              const active = sort?.field === c.field;
              const Icon = !active ? ArrowUpDownIcon : sort.dir === 1 ? ArrowUpIcon : ArrowDownIcon;
              return (
                <TableHead key={c.field} className={NUMERIC.has(c.format) ? "text-right" : ""}
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                  <button type="button" onClick={() => toggle(c.field)}
                    className={`inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${NUMERIC.has(c.format) ? "flex-row-reverse" : ""}`}>
                    {c.label}
                    <Icon aria-hidden className={`size-3.5 ${active ? "" : "opacity-40"}`} />
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r, i) => (
            <TableRow
              key={i}
              data-state={click && vars[click.setVariable] === r[click.field] ? "selected" : undefined}
              className={click || link ? "cursor-pointer" : ""}
              onClick={click || link ? () => open(r) : undefined}
            >
              {node.columns.map((c) => (
                <TableCell key={c.field} className={NUMERIC.has(c.format) ? "text-right tabular-nums" : ""}>
                  {c.format === "badge" && r[c.field] != null
                    ? <Badge variant={BADGE_VARIANT(String(r[c.field]))}>{String(r[c.field])}</Badge>
                    : formatValue(r[c.field], c.format)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">{current * size + 1}–{Math.min(sorted.length, current * size + size)} di {sorted.length}</span>
          <Button variant="outline" size="icon-sm" aria-label="Pagina precedente" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Pagina successiva" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
  return node.title ? (
    <Card>
      <CardHeader><CardTitle>{node.title}</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  ) : body;
}

const compact = new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 });

export function Chart({ node }: { node: NodeOf<"chart"> }) {
  const { rows, error, loading } = useSpecQuery(node.query);
  const config: ChartConfig = node.kind === "pie"
    ? Object.fromEntries((rows ?? []).map((r, i) => [String(r[node.x] ?? "—"), { label: String(r[node.x] ?? "—"), color: `var(--chart-${(i % 5) + 1})` }]))
    : Object.fromEntries(node.y.map((y, i) => [y, { label: y, color: `var(--chart-${(i % 5) + 1})` }]));
  let body;
  if (loading) body = <Loading className="h-64" />;
  else if (error) body = <NodeError message={error} />;
  else if (!rows?.length) body = <NoData />;
  else {
    const data = rows.map((r) => ({ ...r, [node.x]: r[node.x] ?? "—" }));
    const axes = [
      <CartesianGrid key="g" vertical={false} />,
      <XAxis key="x" dataKey={node.x} tickLine={false} axisLine={false} tickMargin={8} />,
      <YAxis key="y" tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact.format(v)} />,
      <ChartTooltip key="t" content={<ChartTooltipContent />} />,
      node.y.length > 1 ? <ChartLegend key="l" content={<ChartLegendContent />} /> : null,
    ];
    const chart = node.kind === "pie" ? (
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey={node.x} />} />
        <ChartLegend content={<ChartLegendContent nameKey={node.x} />} className="flex-wrap gap-x-3" />
        <Pie data={data} dataKey={node.y[0]} nameKey={node.x} innerRadius="45%">
          {data.map((_, i) => <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />)}
        </Pie>
      </PieChart>
    ) : node.kind === "line" ? (
      <LineChart data={data}>{axes}{node.y.map((y) => <Line key={y} dataKey={y} stroke={`var(--color-${y})`} strokeWidth={2} dot={false} />)}</LineChart>
    ) : node.kind === "area" ? (
      <AreaChart data={data}>{axes}{node.y.map((y) => <Area key={y} dataKey={y} stackId={node.stacked ? "s" : undefined} stroke={`var(--color-${y})`} fill={`var(--color-${y})`} fillOpacity={0.2} />)}</AreaChart>
    ) : (
      <BarChart data={data}>{axes}{node.y.map((y) => <Bar key={y} dataKey={y} stackId={node.stacked ? "s" : undefined} fill={`var(--color-${y})`} radius={node.stacked ? 0 : 4} />)}</BarChart>
    );
    body = <ChartContainer config={config} className="aspect-auto h-64 w-full">{chart}</ChartContainer>;
  }
  return (
    <Card>
      {node.title && <CardHeader><CardTitle>{node.title}</CardTitle></CardHeader>}
      <CardContent>{body}</CardContent>
    </Card>
  );
}

const ALL = "__tutti__";

export function Filter({ node }: { node: NodeOf<"filter"> }) {
  const { vars, setVar } = useRender();
  const value = vars[node.variable];
  const id = `filter-${node.id}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{node.label}</Label>
      {node.input === "select" ? <SelectFilter node={node} id={id} />
        : node.input === "date" ? (
          <Input id={id} type="date" value={value == null ? "" : String(value)} onChange={(e) => setVar(node.variable, e.target.value || null)} />
        ) : <SearchFilter node={node} id={id} />}
    </div>
  );
}

function SearchFilter({ node, id }: { node: NodeOf<"filter">; id: string }) {
  const { vars, setVar } = useRender();
  const [text, setText] = useState(vars[node.variable] == null ? "" : String(vars[node.variable]));
  useEffect(() => {
    const t = setTimeout(() => setVar(node.variable, text.trim() || null), 300);
    return () => clearTimeout(t);
  }, [text, node.variable, setVar]);
  return <Input id={id} type="search" placeholder="Cerca…" value={text} onChange={(e) => setText(e.target.value)} />;
}

function SelectFilter({ node, id }: { node: NodeOf<"filter">; id: string }) {
  const { vars, setVar } = useRender();
  const opts = useOptions(node).options.map(({ value, label }) => ({ value, label }));
  const current = vars[node.variable];
  const items = [{ value: ALL, label: "Tutti" }, ...opts];
  return (
    <Select
      items={items}
      value={current == null ? ALL : String(current)}
      onValueChange={(v) => setVar(node.variable, v === ALL || v == null ? null : String(v))}
    >
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {items.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
