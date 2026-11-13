import { createContext, useContext } from "react";
import type { Collection, Node, Scalar } from "@sibilla/shared";
import type { DataApi } from "../dataApi";

export type Vars = Record<string, Scalar>;
/** A link followed inside a view: the route it leads to, the values of its parameters, and what that screen is for. */
export type Nav = { to: string; params: Record<string, Scalar>; intent: string; label: string };

export type RenderCtx = {
  vars: Vars;
  setVar: (name: string, value: Scalar) => void;
  /** Bumped after a successful write: every data node refetches. */
  refreshKey: number;
  refresh: () => void;
  childrenOf: (id: string) => Node[];
  /** Queries and writes, scoped to the mini webapp this spec defines (if it has collections). */
  data: DataApi;
  collections: Collection[];
  /** The spec is still being written: show its shape, don't load data or run custom code. */
  preview?: boolean;
  /** Opens another screen of the app. Absent where navigation makes no sense (previews). */
  navigate?: (nav: Nav) => void;
  /** Sends a correction request to the chat (custom views with errors). */
  onAskFix?: (prompt: string) => void;
};

export const Ctx = createContext<RenderCtx | null>(null);

export function useRender() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRender fuori da <Renderer>");
  return c;
}
