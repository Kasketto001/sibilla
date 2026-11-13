import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Query, Spec } from "@sibilla/shared";
import { api } from "../api";
import { Renderer } from "./Renderer";

vi.mock("../api", async (orig) => {
  const m = await orig<typeof import("../api")>();
  return { ...m, api: { ...m.api, query: vi.fn(), schema: vi.fn() } };
});
const query = vi.mocked(api.query);

const q = (over: Partial<Query> = {}): Query => ({
  table: "ordini", select: [], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: null, ...over,
});

beforeEach(() => { query.mockReset(); });

test("kpi with empty result shows an empty state", async () => {
  query.mockResolvedValue({ rows: [] });
  const spec: Spec = { title: "t", variables: [], nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "k", parentId: "root", type: "kpi", label: "Fatturato", field: "tot", format: "currency",
      query: q({ aggregates: [{ fn: "sum", field: "totale", as: "tot" }] }) },
  ] };
  render(<Renderer spec={spec} />);
  expect(await screen.findByText("Nessun dato")).toBeInTheDocument();
  expect(screen.getByText("Fatturato")).toBeInTheDocument();
});

test("a failing node shows an alert and leaves siblings alone", async () => {
  query.mockRejectedValue(new Error("colonna inesistente"));
  const spec: Spec = { title: "t", variables: [], nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "h", parentId: "root", type: "heading", text: "Ordini recenti", level: 1 },
    { id: "t", parentId: "root", type: "table", title: null, rowClick: null, query: q({ select: ["id"] }),
      columns: [{ field: "id", label: "N.", format: "number" }] },
  ] };
  render(<Renderer spec={spec} />);
  expect(await screen.findByText(/colonna inesistente/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Ordini recenti" })).toBeInTheDocument();
});

test("table renders rows with formats", async () => {
  query.mockResolvedValue({ rows: [{ id: 7, stato: "spedito", totale: 12345.5 }] });
  const spec: Spec = { title: "t", variables: [], nodes: [
    { id: "t", parentId: null, type: "table", title: "Ordini", rowClick: null, query: q({ select: ["id", "stato", "totale"] }),
      columns: [
        { field: "id", label: "N.", format: "number" },
        { field: "stato", label: "Stato", format: "badge" },
        { field: "totale", label: "Totale", format: "currency" },
      ] },
  ] };
  render(<Renderer spec={spec} />);
  expect(await screen.findByText("spedito")).toBeInTheDocument();
  expect(screen.getByText(/12\.345,50/)).toBeInTheDocument();
});

test("unknown node type does not crash the page", async () => {
  const spec = { title: "t", variables: [], nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "h", parentId: "root", type: "heading", text: "Visibile", level: 2 },
    { id: "x", parentId: "root", type: "mistero" },
  ] } as unknown as Spec;
  render(<Renderer spec={spec} />);
  expect(screen.getByRole("heading", { name: "Visibile" })).toBeInTheDocument();
});

test("search filter feeds its variable into dependent queries", async () => {
  query.mockResolvedValue({ rows: [] });
  const spec: Spec = { title: "t", variables: [{ name: "cerca", type: "string", default: null }], nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "f", parentId: "root", type: "filter", variable: "cerca", label: "Cerca", input: "search",
      optionsQuery: null, optionValue: null, optionLabel: null },
    { id: "t", parentId: "root", type: "table", title: null, rowClick: null,
      query: q({ table: "clienti", select: ["nome"], where: [{ field: "nome", op: "like", value: "{{cerca}}" }] }),
      columns: [{ field: "nome", label: "Nome", format: "text" }] },
  ] };
  render(<Renderer spec={spec} />);
  await waitFor(() => expect(query).toHaveBeenCalled());
  expect(query.mock.calls[0][1]).toEqual({ cerca: null });
  await userEvent.type(screen.getByLabelText("Cerca"), "ros");
  await waitFor(() => expect(query.mock.calls.at(-1)![1]).toEqual({ cerca: "ros" }), { timeout: 2000 });
});

test("row click sets the variable", async () => {
  query.mockImplementation(async (qq) => (qq.table === "ordini"
    ? { rows: [{ id: 5, stato: "nuovo" }] }
    : { rows: [] }));
  const spec: Spec = { title: "t", variables: [{ name: "sel", type: "number", default: null }], nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "t", parentId: "root", type: "table", title: null, rowClick: { setVariable: "sel", field: "id" },
      query: q({ select: ["id", "stato"] }), columns: [{ field: "stato", label: "Stato", format: "text" }] },
    { id: "k", parentId: "root", type: "kpi", label: "Sel", field: "n", format: "number",
      query: q({ table: "clienti", aggregates: [{ fn: "count", field: "*", as: "n" }], where: [{ field: "id", op: "eq", value: "{{sel}}" }] }) },
  ] };
  render(<Renderer spec={spec} />);
  await userEvent.click(await screen.findByText("nuovo"));
  await waitFor(() => expect(query.mock.calls.some(([qq, v]) => qq.table === "clienti" && v.sel === 5)).toBe(true));
});

test("previous rows stay visible while a query reloads", async () => {
  let release: (v: { rows: Record<string, string>[] }) => void = () => {};
  query.mockResolvedValueOnce({ rows: [{ nome: "Rossi" }] })
    .mockImplementationOnce(() => new Promise((r) => { release = r; }));
  const spec: Spec = { title: "t", variables: [{ name: "cerca", type: "string", default: null }], nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "f", parentId: "root", type: "filter", variable: "cerca", label: "Cerca", input: "search",
      optionsQuery: null, optionValue: null, optionLabel: null },
    { id: "t", parentId: "root", type: "table", title: null, rowClick: null,
      query: q({ table: "clienti", select: ["nome"], where: [{ field: "nome", op: "like", value: "{{cerca}}" }] }),
      columns: [{ field: "nome", label: "Nome", format: "text" }] },
  ] };
  render(<Renderer spec={spec} />);
  expect(await screen.findByText("Rossi")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Cerca"), "ver");
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2), { timeout: 2000 });
  expect(screen.getByText("Rossi")).toBeInTheDocument();
  release({ rows: [{ nome: "Verdi" }] });
  expect(await screen.findByText("Verdi")).toBeInTheDocument();
});

test("tables paginate and sort by clicking a header", async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, nome: `C${String(i + 1).padStart(2, "0")}` }));
  query.mockResolvedValue({ rows });
  const spec: Spec = { title: "t", variables: [], nodes: [
    { id: "t", parentId: null, type: "table", title: null, rowClick: null, pageSize: 5,
      query: q({ table: "clienti", select: ["id", "nome"] }),
      columns: [{ field: "id", label: "N.", format: "number" }, { field: "nome", label: "Nome", format: "text" }] },
  ] };
  render(<Renderer spec={spec} />);
  expect(await screen.findByText("C01")).toBeInTheDocument();
  expect(screen.queryByText("C06")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
  expect(screen.getByText("C06")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Nome/ }));
  await userEvent.click(screen.getByRole("button", { name: /Nome/ }));
  expect(screen.getByText("C12")).toBeInTheDocument();
});

test("grid children honor span", async () => {
  const spec: Spec = { title: "t", variables: [], nodes: [
    { id: "g", parentId: null, type: "grid", columns: 3 },
    { id: "a", parentId: "g", type: "text", text: "largo", span: 2 },
  ] };
  render(<Renderer spec={spec} />);
  expect(screen.getByText("largo").closest("[data-span]")).toHaveAttribute("data-span", "2");
});

test("text renders markdown", () => {
  const spec: Spec = { title: "t", variables: [], nodes: [{ id: "x", parentId: null, type: "text", text: "Totale **in crescita**" }] };
  render(<Renderer spec={spec} />);
  expect(screen.getByText("in crescita").tagName).toBe("STRONG");
});
