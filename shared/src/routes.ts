const SEGMENT = "(?:[a-z0-9_-]+|:[a-z_][a-z0-9_]*)";
const ROUTE = new RegExp(`^/(?:${SEGMENT}(?:/${SEGMENT})*)?$`);

/** "/", "/clienti", "/clienti/:id/ordini": lowercase segments, parameters as ":nome". */
export const isRoute = (path: string) => ROUTE.test(path);

/** Names of a route's parameters: "/clienti/:id" → ["id"]. */
export const routeParams = (path: string) => path.split("/").filter((s) => s.startsWith(":")).map((s) => s.slice(1));
