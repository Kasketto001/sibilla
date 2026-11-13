import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Spec } from "@sibilla/shared";
import { api } from "../api";
import { Renderer } from "./Renderer";

vi.mock("../api", async (orig) => {
  const m = await orig<typeof import("../api")>();
  return { ...m, api: { ...m.api, bundle: vi.fn(), query: vi.fn() } };
});
const mocked = vi.mocked(api);

const spec: Spec = { title: "t", variables: [], nodes: [
  { id: "c", parentId: null, type: "custom", source: "export default () => <b>ciao</b>", libraries: ["antd@5"], stylesheets: [], height: null },
] };

beforeEach(() => { vi.resetAllMocks(); });

test("compiled custom code runs in a sandboxed iframe", async () => {
  mocked.bundle.mockResolvedValue({ hash: "b".repeat(32) });
  render(<Renderer spec={spec} />);
  const frame = await screen.findByTitle("Vista personalizzata");
  expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
  expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  expect(frame.getAttribute("srcdoc")).toContain(`/api/bundle/${"b".repeat(32)}.js`);
  expect(mocked.bundle).toHaveBeenCalledWith("export default () => <b>ciao</b>", ["antd@5"], []);
});

test("a compile error is shown and can be sent back to Sibilla", async () => {
  mocked.bundle.mockRejectedValue(new Error("riga 1: Unexpected end of file"));
  const ask = vi.fn();
  render(<Renderer spec={spec} onAskFix={ask} />);
  expect(await screen.findByText(/Unexpected end of file/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Chiedi a Sibilla di correggere/ }));
  expect(ask).toHaveBeenCalledWith(expect.stringContaining("Unexpected end of file"));
});
