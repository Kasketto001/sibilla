import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { InterfaceDetail } from "@sibilla/shared";
import { CanvasHeader } from "./CanvasHeader";

const detail: InterfaceDetail = {
  id: 1, nome: "Vendite", descrizione: null, updatedAt: "x", latestVersion: 3, kind: "view", pinned: false, archived: false, shareToken: null,
  versions: [1, 2, 3].map((numero) => ({ numero, prompt: null, createdAt: "x" })),
};
const noop = () => {};
const header = (version: number) => (
  <CanvasHeader title="t" detail={detail} version={version} busy={false}
    onSelectVersion={noop} onRestore={noop} onRename={noop} onDelete={noop} />
);

test("an old version offers restore", () => {
  render(header(1));
  expect(screen.getByRole("button", { name: /Ripristina/ })).toBeInTheDocument();
});

test("the latest version has nothing to save or restore: saving is automatic", () => {
  render(header(3));
  expect(screen.queryByRole("button", { name: /Ripristina/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Salva/ })).not.toBeInTheDocument();
});

test("the interface name keeps a minimum width", () => {
  render(header(1));
  expect(screen.getByRole("heading", { name: "Vendite" }).parentElement!.className).toMatch(/min-w-\[/);
});
