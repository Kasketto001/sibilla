import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DbSchema, Spec } from "@sibilla/shared";
import { ApiError, api } from "../api";
import { Renderer } from "./Renderer";

vi.mock("../api", async (orig) => {
  const m = await orig<typeof import("../api")>();
  return { ...m, api: { ...m.api, query: vi.fn(), schema: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn() } };
});
const mocked = vi.mocked(api);

const schema: DbSchema = { tables: [{ name: "clienti", columns: [
  { name: "id", type: "integer", notNull: false, pk: true, hasDefault: false, generated: false, references: null },
  { name: "nome", type: "text", notNull: true, pk: false, hasDefault: false, generated: false, references: null },
  { name: "citta", type: "text", notNull: false, pk: false, hasDefault: false, generated: false, references: null },
] }] };

const form = (mode: "create" | "edit"): Spec => ({
  title: "t",
  variables: [{ name: "sel", type: "number", default: mode === "edit" ? 5 : null }],
  nodes: [
    { id: "root", parentId: null, type: "stack", direction: "column" },
    { id: "f", parentId: "root", type: "form", table: "clienti", mode, recordIdVariable: mode === "edit" ? "sel" : null,
      submitLabel: "Salva", fields: [
        { column: "nome", label: "Nome", input: "text", optionsQuery: null, optionValue: null, optionLabel: null },
        { column: "citta", label: "Città", input: "text", optionsQuery: null, optionValue: null, optionLabel: null },
      ] },
  ],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocked.schema.mockResolvedValue(schema);
  mocked.query.mockResolvedValue({ rows: [{ id: 5, nome: "Rossi Srl", citta: "Bari" }] });
});

test("create submits the typed values", async () => {
  mocked.createRecord.mockResolvedValue({ id: 99, nome: "Verdi", citta: "Lecce" });
  render(<Renderer spec={form("create")} />);
  await userEvent.type(await screen.findByLabelText(/Nome/), "Verdi");
  await userEvent.type(screen.getByLabelText(/Città/), "Lecce");
  await userEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(mocked.createRecord).toHaveBeenCalledWith("clienti", { nome: "Verdi", citta: "Lecce" }));
});

test("server field errors appear under the field", async () => {
  mocked.createRecord.mockRejectedValue(new ApiError(400, "Dati non validi", { citta: "Valore non valido" }));
  render(<Renderer spec={form("create")} />);
  await userEvent.type(await screen.findByLabelText(/Nome/), "Verdi");
  await userEvent.type(screen.getByLabelText(/Città/), "???");
  await userEvent.click(screen.getByRole("button", { name: "Salva" }));
  expect(await screen.findByText("Valore non valido")).toBeInTheDocument();
  expect(mocked.createRecord).toHaveBeenCalled();
});

test("required fields are checked before calling the server", async () => {
  render(<Renderer spec={form("create")} />);
  await userEvent.click(await screen.findByRole("button", { name: "Salva" }));
  expect(await screen.findByText("Campo obbligatorio")).toBeInTheDocument();
  expect(mocked.createRecord).not.toHaveBeenCalled();
});

test("edit form is prefilled and updates by id", async () => {
  mocked.updateRecord.mockResolvedValue({ id: 5, nome: "Rossi Srl", citta: "Lecce" });
  render(<Renderer spec={form("edit")} />);
  const citta = await screen.findByDisplayValue("Bari");
  expect(screen.getByDisplayValue("Rossi Srl")).toBeInTheDocument();
  await userEvent.clear(citta);
  await userEvent.type(citta, "Lecce");
  await userEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(mocked.updateRecord).toHaveBeenCalledWith("clienti", 5, { nome: "Rossi Srl", citta: "Lecce" }));
  const [q, vars] = mocked.query.mock.calls[0];
  expect(q.where).toEqual([{ field: "id", op: "eq", value: 5 }]);
  expect(vars).toEqual({});
});

test("dialog opened by a variable shows its form", async () => {
  const spec = form("edit");
  spec.nodes = [
    spec.nodes[0],
    { id: "d", parentId: "root", type: "dialog", title: "Modifica cliente", triggerLabel: null, openVariable: "sel" },
    { ...spec.nodes[1], parentId: "d" },
  ];
  render(<Renderer spec={spec} />);
  expect(await screen.findByText("Modifica cliente")).toBeInTheDocument();
  expect(await screen.findByDisplayValue("Rossi Srl")).toBeInTheDocument();
});

test("switching record never shows the previous record's values", async () => {
  let release: (v: { rows: Record<string, unknown>[] }) => void = () => {};
  mocked.query.mockImplementation(async (q) => (q.table === "ordini"
    ? { rows: [{ id: 5, stato: "a" }, { id: 6, stato: "b" }] }
    : (q.where[0]?.value === 5 ? { rows: [{ id: 5, nome: "Rossi Srl", citta: "Bari" }] }
      : new Promise((r) => { release = r as typeof release; }))) as never);
  const spec = form("edit");
  spec.nodes.push({ id: "t", parentId: "root", type: "table", title: null, rowClick: { setVariable: "sel", field: "id" },
    query: { table: "ordini", select: ["id", "stato"], join: [], where: [], groupBy: [], aggregates: [], orderBy: [], limit: null },
    columns: [{ field: "stato", label: "Stato", format: "text" }] });
  render(<Renderer spec={spec} />);
  await screen.findByDisplayValue("Rossi Srl");
  await userEvent.click(screen.getByText("b"));
  await waitFor(() => expect(screen.queryByDisplayValue("Rossi Srl")).not.toBeInTheDocument());
  release({ rows: [{ id: 6, nome: "Verdi Spa", citta: "Lecce" }] });
  expect(await screen.findByDisplayValue("Verdi Spa")).toBeInTheDocument();
});

test("server errors on fields not in the form are still shown", async () => {
  mocked.createRecord.mockRejectedValue(new ApiError(400, "Dati non validi", { segmento: "Campo obbligatorio" }));
  render(<Renderer spec={form("create")} />);
  await userEvent.type(await screen.findByLabelText(/Nome/), "Verdi");
  await userEvent.click(screen.getByRole("button", { name: "Salva" }));
  expect(await screen.findByText(/segmento: Campo obbligatorio/)).toBeInTheDocument();
});

test("a mini webapp's form works on its own collection, scoped to the app, and can delete", async () => {
  const collections = [{ name: "note", fields: [
    { name: "testo", type: "text" as const, required: true, references: null },
    { name: "stato", type: "text" as const, required: false, references: null },
  ] }];
  const app = { id: "app-1", collections };
  mocked.query.mockResolvedValue({ rows: [{ id: 7, testo: "Chiamare Rossi", stato: "aperta" }] });
  mocked.deleteRecord.mockResolvedValue(undefined);
  const spec: Spec = {
    title: "t", appId: app.id, collections, variables: [{ name: "sel", type: "number", default: 7 }],
    nodes: [{ id: "f", parentId: null, type: "form", table: "note", mode: "edit", recordIdVariable: "sel", submitLabel: "Salva", allowDelete: true,
      fields: [
        { column: "testo", label: "Testo", input: "text", optionsQuery: null, optionValue: null, optionLabel: null },
        { column: "stato", label: "Stato", input: "select", optionsQuery: null, optionValue: null, optionLabel: null, choices: ["aperta", "chiusa"] },
      ] }],
  };
  render(<Renderer spec={spec} />);
  expect(await screen.findByDisplayValue("Chiamare Rossi")).toBeInTheDocument();
  expect(mocked.query.mock.calls[0][2]).toEqual(app);

  await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
  await userEvent.click(await screen.findByRole("button", { name: "Elimina" }));
  await waitFor(() => expect(mocked.deleteRecord).toHaveBeenCalledWith("note", 7, app));
  expect(await screen.findByText("Seleziona un record da modificare.")).toBeInTheDocument();
});
