import { expect, test, vi } from "vitest";
import { buildSandbox, handleBridge } from "./sandbox";

const ORIGIN = "http://localhost:5174";
const doc = (over = {}) => buildSandbox({ hash: "a".repeat(32), origin: ORIGIN, themeCss: "--primary: red;", ...over });

test("the view bundle, its CSS and Tailwind are loaded from our own server", () => {
  const html = doc();
  expect(html).toContain(`<script type="module" src="${ORIGIN}/api/bundle/${"a".repeat(32)}.js"></script>`);
  expect(html).toContain(`href="${ORIGIN}/api/bundle/${"a".repeat(32)}.css"`);
  expect(html).toContain(`src="${ORIGIN}/api/runtime/tailwind.js"`);
  expect(html).not.toContain("esm.sh");
});

test("CSP allows scripts only inline and from our origin, and blocks network calls", () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(doc())![1];
  expect(csp).toContain(`script-src 'unsafe-inline' ${ORIGIN}`);
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'none'");
});

test("theme vars are injected and cannot break out of the style block", () => {
  expect(doc()).toContain("--primary: red;");
  expect(doc({ themeCss: "--x: 1; } </style><script>alert(1)</script>" })).not.toContain("<script>alert(1)");
});

test("a classic watchdog reports load failures and a view that never starts", () => {
  const html = doc();
  const classic = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  expect(classic).toContain('addEventListener("error"');
  expect(classic).toMatch(/setTimeout\([\s\S]*sibilla: "error"/);
});

test("bridge runs allowed operations and refuses others", async () => {
  const api = { query: vi.fn().mockResolvedValue({ rows: [{ a: 1 }] }), createRecord: vi.fn().mockResolvedValue({ id: 1 }), updateRecord: vi.fn(), deleteRecord: vi.fn() };
  expect(await handleBridge(api, "query", [{ table: "t" }, { x: 1 }])).toEqual({ rows: [{ a: 1 }] });
  expect(api.query).toHaveBeenCalledWith({ table: "t" }, { x: 1 });
  await handleBridge(api, "createRecord", ["clienti", { nome: "x" }]);
  expect(api.createRecord).toHaveBeenCalledWith("clienti", { nome: "x" });
  await expect(handleBridge(api, "deleteInterface", [1])).rejects.toThrow(/non consentita/);
});
