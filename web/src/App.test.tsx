import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InterfaceDetail, Spec } from "@sibilla/shared";
import { api } from "./api";
import App from "./App";

vi.mock("./api", async (orig) => {
  const m = await orig<typeof import("./api")>();
  const fns = Object.fromEntries(Object.keys(m.api).map((k) => [k, vi.fn()]));
  return { ...m, api: fns };
});
const mocked = vi.mocked(api);

const spec = (t: string): Spec => ({ title: t, variables: [], nodes: [{ id: "root", parentId: null, type: "heading", text: t, level: 1 }] });
const detail = (latest: number): InterfaceDetail => ({
  id: 1, nome: "Vendite", descrizione: null, updatedAt: "2026-11-13T10:00:00Z", latestVersion: latest, kind: "view", pinned: false, archived: false, shareToken: null,
  versions: Array.from({ length: latest }, (_, i) => ({ numero: i + 1, prompt: null, createdAt: "2026-11-13T10:00:00Z" })),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocked.listInterfaces.mockResolvedValue([{ id: 1, nome: "Vendite", descrizione: null, updatedAt: "x", latestVersion: 2, kind: "view", pinned: false, archived: false, shareToken: null }]);
  mocked.getInterface.mockResolvedValue(detail(2));
  mocked.getVersion.mockImplementation(async (_id, n) => ({ numero: n, spec: spec(`Vista v${n}`), prompt: null, createdAt: "x" }));
  mocked.listMessages.mockResolvedValue([]);
  mocked.appendMessages.mockResolvedValue(undefined);
});

const sidebar = () => within(screen.getByRole("navigation"));

test("opening a saved interface shows its latest version", async () => {
  render(<App />);
  await userEvent.click(await sidebar().findByRole("button", { name: /Vendite/ }));
  expect(await screen.findByRole("heading", { name: "Vista v2" })).toBeInTheDocument();
  expect(mocked.getVersion).toHaveBeenCalledWith(1, 2);
});

test("deleting the open interface resets to an empty draft", async () => {
  render(<App />);
  await userEvent.click(await sidebar().findByRole("button", { name: /Vendite/ }));
  await screen.findByRole("heading", { name: "Vista v2" });

  mocked.deleteInterface.mockResolvedValue(undefined);
  mocked.listInterfaces.mockResolvedValue([]);
  await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
  await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Elimina" }));

  await waitFor(() => expect(mocked.deleteInterface).toHaveBeenCalledWith(1));
  expect(await screen.findByRole("heading", { name: /cosa costruiamo/ })).toBeInTheDocument();
  await waitFor(() => expect(sidebar().queryByRole("button", { name: /Vendite/ })).not.toBeInTheDocument());
});

test("a new conversation is saved as soon as it starts, and its first interface names it", async () => {
  mocked.listInterfaces.mockResolvedValue([]);
  let finish: (v: { spec: Spec; message: string }) => void = () => {};
  mocked.generate.mockImplementation(() => new Promise((r) => { finish = r; }));
  mocked.createInterface.mockResolvedValue({ ...detail(0), id: 7, nome: "fammi una vista", latestVersion: null });
  mocked.addVersion.mockResolvedValue({ ...detail(1), id: 7, nome: "fammi una vista" });
  mocked.renameInterface.mockResolvedValue({ ...detail(1), id: 7, nome: "Nuova vista" });
  render(<App />);
  await userEvent.type(screen.getByLabelText("Messaggio"), "fammi una vista{Enter}");

  // Saved before the answer arrives, with the question.
  await waitFor(() => expect(mocked.createInterface).toHaveBeenCalledWith({
    nome: "fammi una vista", descrizione: null, spec: null, prompt: null,
    messages: [{ role: "user", content: "fammi una vista", attachments: [] }],
  }));
  await waitFor(() => expect(mocked.generate).toHaveBeenCalled());
  finish({ spec: spec("Nuova vista"), message: "ok" });

  await waitFor(() => expect(mocked.addVersion).toHaveBeenCalledWith(7, { spec: spec("Nuova vista"), prompt: "fammi una vista" }));
  expect(mocked.appendMessages).toHaveBeenCalledWith(7, [{ role: "assistant", content: "ok" }]);
  await waitFor(() => expect(mocked.renameInterface).toHaveBeenCalledWith(7, { nome: "Nuova vista" }));
  await waitFor(() => expect(screen.getAllByRole("heading", { name: "Nuova vista" })).toHaveLength(2)); // title bar + the view
  expect(screen.queryByRole("button", { name: /Salva/ })).not.toBeInTheDocument();
});

test("a change to a saved interface is saved by itself as a new version, keeping its name", async () => {
  mocked.generate.mockResolvedValue({ spec: spec("Vista modificata"), message: "ok" });
  mocked.addVersion.mockResolvedValue(detail(3));
  render(<App />);
  await userEvent.click(await sidebar().findByRole("button", { name: /Vendite/ }));
  await screen.findByRole("heading", { name: "Vista v2" });
  await userEvent.type(screen.getByLabelText("Messaggio"), "cambia titolo{Enter}");
  await screen.findByRole("heading", { name: "Vista modificata" });
  await waitFor(() => expect(mocked.addVersion).toHaveBeenCalledWith(1, { spec: spec("Vista modificata"), prompt: "cambia titolo" }));
  expect(mocked.renameInterface).not.toHaveBeenCalled();
  expect(mocked.createInterface).not.toHaveBeenCalled();
});

test("a conversation without an interface yet is a full-page chat", async () => {
  mocked.listInterfaces.mockResolvedValue([]);
  mocked.generate.mockResolvedValue({ spec: null, message: "Ci sono 300 ordini." });
  mocked.createInterface.mockResolvedValue({ ...detail(0), id: 7, nome: "quanti ordini?", latestVersion: null });
  render(<App />);
  await userEvent.type(screen.getByLabelText("Messaggio"), "quanti ordini?{Enter}");
  expect(await screen.findByText("Ci sono 300 ordini.")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /cosa costruiamo/ })).not.toBeInTheDocument();
  expect(mocked.addVersion).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Messaggio")).toBeInTheDocument();
});

test("a generation that finishes after switching interface stays out of the screen", async () => {
  let finish: (v: { spec: Spec; message: string }) => void = () => {};
  mocked.generate.mockImplementation(() => new Promise((r) => { finish = r; }));
  render(<App />);
  await userEvent.type(screen.getByLabelText("Messaggio"), "una vista{Enter}");
  await userEvent.click(await sidebar().findByRole("button", { name: /Vendite/ }));
  await screen.findByRole("heading", { name: "Vista v2" });
  finish({ spec: spec("Vista tardiva"), message: "ok" });
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole("heading", { name: "Vista tardiva" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Vista v2" })).toBeInTheDocument();
});

test("a text-only answer is shown in the chat and keeps the current screen", async () => {
  mocked.listInterfaces.mockResolvedValue([]);
  mocked.generate.mockResolvedValueOnce({ spec: spec("Prima"), message: "Ecco" })
    .mockResolvedValueOnce({ spec: null, message: "Ci sono 300 ordini." });
  render(<App />);
  await userEvent.type(screen.getByLabelText("Messaggio"), "crea{Enter}");
  await screen.findAllByRole("heading", { name: "Prima" });
  await userEvent.type(screen.getByLabelText("Messaggio"), "quanti ordini?{Enter}");
  expect(await screen.findByText("Ci sono 300 ordini.")).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: "Prima" }).length).toBeGreaterThan(0);
});

test("empty canvas offers clickable suggestions", async () => {
  mocked.listInterfaces.mockResolvedValue([]);
  mocked.generate.mockResolvedValue({ spec: spec("Da suggerimento"), message: "ok" });
  render(<App />);
  const [first] = await screen.findAllByRole("button", { name: /dashboard|elenco|gestione|andamento/i });
  await userEvent.click(first);
  expect(mocked.generate).toHaveBeenCalled();
});

test("a spec style is applied to the view container", async () => {
  mocked.listInterfaces.mockResolvedValue([]);
  mocked.generate.mockResolvedValue({ spec: { ...spec("Scura"), style: { colorScheme: "dark", primary: "#7c3aed" } }, message: "ok" });
  render(<App />);
  await userEvent.type(screen.getByLabelText("Messaggio"), "falla scura{Enter}");
  const view = (await screen.findAllByRole("heading", { name: "Scura" })).at(-1)!.closest("[data-view]") as HTMLElement;
  expect(view.className).toContain("dark");
  expect(view.style.getPropertyValue("--primary")).toBe("#7c3aed");
});

test("opening a saved interface restores its chat", async () => {
  mocked.listMessages.mockResolvedValue([
    { role: "user", content: "crea le vendite", attachments: ["bozza.png"], createdAt: "x" },
    { role: "assistant", content: "Fatto, ecco le vendite.", attachments: [], createdAt: "x" },
  ]);
  render(<App />);
  await userEvent.click(await sidebar().findByRole("button", { name: /Vendite/ }));
  expect(await screen.findByText("Fatto, ecco le vendite.")).toBeInTheDocument();
  expect(screen.getByText("bozza.png")).toBeInTheDocument();
});

test("each exchange on a saved interface is stored", async () => {
  mocked.generate.mockResolvedValue({ spec: null, message: "Sono 300." });
  render(<App />);
  await userEvent.click(await sidebar().findByRole("button", { name: /Vendite/ }));
  await screen.findByRole("heading", { name: "Vista v2" });
  await userEvent.type(screen.getByLabelText("Messaggio"), "quanti ordini?{Enter}");
  await waitFor(() => expect(mocked.appendMessages).toHaveBeenCalledWith(1, [
    { role: "user", content: "quanti ordini?", attachments: [] }, { role: "assistant", content: "Sono 300." },
  ]));
});

test("a link generates its screen the first time, then just opens it; back returns", async () => {
  const stack = { id: "root", parentId: null, type: "stack" as const, direction: "column" as const };
  const h = (text: string) => ({ id: "h", parentId: "root", type: "heading" as const, text, level: 1 as const });
  const home: Spec = { title: "CRM", variables: [], nodes: [stack, h("Elenco clienti"),
    { id: "l", parentId: "root", type: "link", label: "Report", variant: "button", to: "/report", params: [], intent: "report vendite" }] };
  const report: Spec = { title: "Report", variables: [], nodes: [stack, h("Report vendite")] };
  mocked.getVersion.mockResolvedValue({ numero: 2, spec: home, prompt: null, createdAt: "x" });
  mocked.generate.mockResolvedValue({ spec: report, message: "Ecco il report." });
  mocked.addVersion.mockResolvedValue(detail(3));
  render(<App />);
  await userEvent.click(await sidebar().findByRole("button", { name: /Vendite/ }));
  await screen.findByRole("heading", { name: "Elenco clienti" });

  await userEvent.click(screen.getByRole("button", { name: "Report" }));
  expect(await screen.findByRole("heading", { name: "Report vendite" })).toBeInTheDocument();
  expect(mocked.generate.mock.calls[0][0]).toMatchObject({ currentSpec: home, navigate: { from: "/", to: "/report", intent: "report vendite", label: "Report" } });
  // The new screen is saved into the app, next to the first one.
  await waitFor(() => expect(mocked.addVersion).toHaveBeenCalledWith(1, {
    spec: { ...home, screens: [{ path: "/report", title: "Report", variables: [], nodes: report.nodes, message: "Ecco il report." }] },
    prompt: "Apri «Report»",
  }));
  expect(screen.getByText("Ecco il report.")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /Indietro/ }));
  await screen.findByRole("heading", { name: "Elenco clienti" });
  await userEvent.click(screen.getByRole("button", { name: "Report" }));
  expect(await screen.findByRole("heading", { name: "Report vendite" })).toBeInTheDocument();
  expect(mocked.generate).toHaveBeenCalledTimes(1); // kept: not generated again
});
