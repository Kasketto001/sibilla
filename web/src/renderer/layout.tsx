import { ArrowRightIcon } from "lucide-react";
import { varName, type NodeOf, type Scalar } from "@sibilla/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "../Markdown";
import { useRender } from "./context";
import { Children } from "./Renderer";

const GRID = ["grid-cols-1", "grid-cols-1 md:grid-cols-2", "grid-cols-1 md:grid-cols-2 xl:grid-cols-3", "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"];

export const Stack = ({ node }: { node: NodeOf<"stack"> }) => (
  <div className={node.direction === "row" ? "flex flex-wrap items-start gap-4 [&>*]:min-w-0 [&>*]:flex-1" : "flex flex-col gap-6"}>
    <Children id={node.id} />
  </div>
);

export const Grid = ({ node }: { node: NodeOf<"grid"> }) => (
  <div className={`grid gap-4 ${GRID[Math.min(Math.max(node.columns, 1), 4) - 1]}`}>
    <Children id={node.id} />
  </div>
);

export const CardNode = ({ node }: { node: NodeOf<"card"> }) => (
  <Card>
    <CardHeader>
      <CardTitle>{node.title}</CardTitle>
      {node.description && <CardDescription>{node.description}</CardDescription>}
    </CardHeader>
    {/* A chart/table/kpi placed directly in a section brings its own card: flatten it so frames don't nest. */}
    <CardContent className="flex flex-col gap-4 [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:shadow-none [&>[data-slot=card]]:ring-0 [&>[data-slot=card]]:[--card-spacing:0]">
      <Children id={node.id} />
    </CardContent>
  </Card>
);

const HEADING = {
  1: "font-heading text-2xl font-semibold tracking-tight",
  2: "font-heading text-xl font-semibold tracking-tight",
  3: "font-heading text-base font-semibold",
} as const;

export function Heading({ node }: { node: NodeOf<"heading"> }) {
  const Tag = `h${node.level}` as "h1" | "h2" | "h3";
  return <Tag className={HEADING[node.level]}>{node.text}</Tag>;
}

export const Text = ({ node }: { node: NodeOf<"text"> }) => (
  <div className="max-w-prose text-sm text-muted-foreground"><Markdown text={node.text} /></div>
);

export function TabsNode({ node }: { node: NodeOf<"tabs"> }) {
  const tabs = useRender().childrenOf(node.id).filter((n): n is NodeOf<"tab"> => n.type === "tab");
  if (!tabs.length) return null;
  return (
    <Tabs defaultValue={tabs[0].id}>
      <TabsList>
        {tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} className="flex flex-col gap-6 pt-2">
          <Children id={t.id} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Opens another screen of the app; route parameters take a literal value or the current value of a variable. */
export function LinkNode({ node }: { node: NodeOf<"link"> }) {
  const { vars, navigate } = useRender();
  const go = () => {
    const params: Record<string, Scalar> = {};
    for (const p of node.params) { const v = varName(p.value); params[p.name] = v ? vars[v] ?? null : p.value; }
    navigate?.({ to: node.to, params, intent: node.intent, label: node.label });
  };
  return node.variant === "link"
    ? <Button variant="link" className="h-auto self-start p-0" onClick={go}>{node.label}<ArrowRightIcon /></Button>
    : <Button className="self-start" onClick={go}>{node.label}</Button>;
}
