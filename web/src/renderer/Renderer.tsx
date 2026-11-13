import { useCallback, useMemo, useState, type ComponentType } from "react";
import type { Node, Scalar, Spec } from "@sibilla/shared";
import { dataApi } from "../dataApi";
import { Ctx, useRender, type Nav, type RenderCtx, type Vars } from "./context";
import { CardNode, Grid, Heading, LinkNode, Stack, TabsNode, Text } from "./layout";
import { Chart, DataTable, Filter, Kpi } from "./data";
import { DialogNode, FormNode } from "./form";
import { CustomNode } from "./custom";
import { Loading, NodeBoundary } from "./states";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VIEWS: Partial<Record<Node["type"], ComponentType<{ node: any }>>> = {
  stack: Stack, grid: Grid, card: CardNode, heading: Heading, text: Text, tabs: TabsNode,
  kpi: Kpi, table: DataTable, chart: Chart, filter: Filter, dialog: DialogNode, form: FormNode, custom: CustomNode, link: LinkNode,
};

// Static strings so Tailwind generates them. Spans apply once the view is wide enough for columns; narrower, everything stacks.
const SPAN = ["@lg:col-span-1", "@lg:col-span-2", "@lg:col-span-2 @xl:col-span-3", "@lg:col-span-2 @4xl:col-span-4"];

// In a preview, nodes that need data or run code are placeholders of about the right height.
const PLACEHOLDER: Partial<Record<Node["type"], string>> = {
  kpi: "h-24", table: "h-64", chart: "h-72", form: "h-56", custom: "h-72", filter: "h-14", dialog: "h-9 w-36",
};

export function NodeView({ node }: { node: Node }) {
  const { preview } = useRender();
  const View = VIEWS[node.type];
  if (!View) return null; // unknown node types are skipped, never fatal
  const placeholder = preview ? PLACEHOLDER[node.type] : undefined;
  const view = placeholder ? <Loading className={placeholder} /> : <NodeBoundary><View node={node} /></NodeBoundary>;
  const span = node.span ? Math.min(Math.max(node.span, 1), 4) : null;
  return span ? <div data-span={span} className={`min-w-0 ${SPAN[span - 1]}`}>{view}</div> : view;
}

export function Children({ id }: { id: string }) {
  return <>{useRender().childrenOf(id).map((n) => <NodeView key={n.id} node={n} />)}</>;
}

const initialVars = (spec: Spec): Vars =>
  Object.fromEntries((spec.variables ?? []).map((v) => [v.name, v.default ?? null]));

/** Renders a UI spec. Remount (via key) when the spec identity changes to reset variables. */
export function Renderer({ spec, onAskFix, preview, onNavigate }: {
  spec: Spec; onAskFix?: (prompt: string) => void; preview?: boolean; onNavigate?: (nav: Nav) => void;
}) {
  const [vars, setVars] = useState<Vars>(() => initialVars(spec));
  const [refreshKey, setRefreshKey] = useState(0);
  const setVar = useCallback((name: string, value: Scalar) => setVars((v) => (v[name] === value ? v : { ...v, [name]: value })), []);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const children = useMemo(() => {
    const m = new Map<string, Node[]>();
    for (const n of spec.nodes) if (n.parentId) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n]);
    return m;
  }, [spec]);
  const childrenOf = useCallback((id: string) => children.get(id) ?? [], [children]);
  const collections = useMemo(() => spec.collections ?? [], [spec]);
  const data = useMemo(() => dataApi(spec.appId && collections.length ? { id: spec.appId, collections } : null), [spec, collections]);
  const ctx: RenderCtx = { vars, setVar, refreshKey, refresh, childrenOf, onAskFix, data, collections, preview, navigate: preview ? undefined : onNavigate };

  const root = spec.nodes.find((n) => n.parentId === null);
  // The view is a container: grids inside it size their columns on its width.
  return <Ctx.Provider value={ctx}><div className="@container">{root && <NodeView node={root} />}</div></Ctx.Provider>;
}
