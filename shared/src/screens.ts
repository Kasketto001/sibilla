import type { Scalar, Screen, Spec } from "./spec";

export const HOME = "/";
/** A place in the app: a route pattern and the values of its parameters. */
export type Route = { path: string; params: Record<string, Scalar> };

/**
 * One screen of an app as a spec of its own (what the renderer and the model work on), or null if that screen
 * has not been generated yet. Route parameters become the starting values of the screen's variables.
 */
export function screenSpec(app: Spec, route: Route): Spec | null {
  const { screens: _screens, ...base } = app;
  if (route.path === HOME) return base;
  const s = app.screens?.find((x) => x.path === route.path);
  if (!s) return null;
  const variables = s.variables.map((v) => {
    const p = route.params[v.name];
    return p === undefined || typeof p === "boolean" ? v : { ...v, default: p };
  });
  return { ...base, title: s.title, variables, nodes: s.nodes };
}

/**
 * Puts a screen the model just wrote (as a spec) into the app: the first screen replaces the app's own content,
 * any other is added or replaced by route. Data definitions the screen brought along become the app's.
 */
export function withScreen(app: Spec | null, path: string, made: Spec, message?: string): Spec {
  const { screens: _ignored, ...screen } = made;
  if (!app || path === HOME) return { ...screen, ...(app?.screens?.length ? { screens: app.screens } : {}) };
  const entry: Screen = { path, title: made.title, variables: made.variables, nodes: made.nodes, ...(message ? { message } : {}) };
  return {
    ...app,
    ...(made.appId ? { appId: made.appId } : {}),
    ...(made.collections?.length ? { collections: made.collections } : {}),
    screens: [...(app.screens ?? []).filter((s) => s.path !== path), entry],
  };
}
