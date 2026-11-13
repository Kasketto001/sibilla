import { expect, test } from "vitest";
import type { Spec } from "@sibilla/shared";
import { openDb } from "../src/db";
import {
  addVersion, appendMessages, createInterface, deleteInterface, getInterface, getVersion, listInterfaces, listMessages, updateInterface,
} from "../src/interfaces";

const spec = (title: string): Spec => ({
  title, variables: [], nodes: [{ id: "root", parentId: null, type: "heading", text: title, level: 1 }],
});

test("create gives version 1", () => {
  const db = openDb(":memory:");
  const i = createInterface(db, { nome: "Vendite", spec: spec("v1"), prompt: "p1" });
  expect(i.latestVersion).toBe(1);
  expect(i.versions.map((v) => v.numero)).toEqual([1]);
  expect(listInterfaces(db).map((x) => x.nome)).toEqual(["Vendite"]);
});

test("versions increase and keep their spec", () => {
  const db = openDb(":memory:");
  const { id } = createInterface(db, { nome: "A", spec: spec("v1"), prompt: null });
  addVersion(db, id, { spec: spec("v2"), prompt: "p2" });
  const d = addVersion(db, id, { spec: spec("v3"), prompt: "p3" });
  expect(d!.versions.map((v) => v.numero)).toEqual([1, 2, 3]);
  expect(getVersion(db, id, 2)!.spec).toEqual(spec("v2"));
  expect(getVersion(db, id, 2)!.prompt).toBe("p2");
});

test("restoring a version appends a copy", () => {
  const db = openDb(":memory:");
  const { id } = createInterface(db, { nome: "A", spec: spec("v1"), prompt: null });
  addVersion(db, id, { spec: spec("v2"), prompt: null });
  const d = addVersion(db, id, { spec: getVersion(db, id, 1)!.spec, prompt: null });
  expect(d!.latestVersion).toBe(3);
  expect(getVersion(db, id, 3)!.spec).toEqual(spec("v1"));
});

test("rename updates name and description", () => {
  const db = openDb(":memory:");
  const { id } = createInterface(db, { nome: "A", spec: spec("v1"), prompt: null });
  expect(updateInterface(db, id, { nome: "B", descrizione: "d" })).toMatchObject({ nome: "B", descrizione: "d" });
  expect(updateInterface(db, 999, { nome: "B" })).toBeNull();
});

test("delete removes interface and versions", () => {
  const db = openDb(":memory:");
  const { id } = createInterface(db, { nome: "A", spec: spec("v1"), prompt: null });
  addVersion(db, id, { spec: spec("v2"), prompt: null });
  expect(deleteInterface(db, id)).toBe(true);
  expect(getInterface(db, id)).toBeNull();
  expect(db.prepare("select count(*) n from sib_versions").get()).toEqual({ n: 0 });
  expect(deleteInterface(db, id)).toBe(false);
});

test("invalid spec is refused", () => {
  const db = openDb(":memory:");
  const bad = { ...spec("x"), nodes: [...spec("x").nodes, { id: "r2", parentId: null, type: "text", text: "x" }] } as Spec;
  expect(() => createInterface(db, { nome: "A", spec: bad, prompt: null })).toThrow();
});

test("chat messages are stored per interface, in order, and deleted with it", () => {
  const db = openDb(":memory:");
  const { id } = createInterface(db, { nome: "A", spec: spec("v1"), prompt: null,
    messages: [{ role: "user", content: "crea", attachments: ["a.png"] }, { role: "assistant", content: "fatto" }] });
  appendMessages(db, id, [{ role: "user", content: "quanti?" }, { role: "assistant", content: "300" }]);
  expect(listMessages(db, id)!.map((m) => [m.role, m.content, m.attachments])).toEqual([
    ["user", "crea", ["a.png"]], ["assistant", "fatto", []], ["user", "quanti?", []], ["assistant", "300", []],
  ]);
  expect(appendMessages(db, 999, [{ role: "user", content: "x" }])).toBe(false);
  expect(listMessages(db, 999)).toBeNull();
  deleteInterface(db, id);
  expect(db.prepare("select count(*) n from sib_messages").get()).toEqual({ n: 0 });
});

test("a conversation can be saved before it has an interface; its first one becomes version 1", () => {
  const db = openDb(":memory:");
  const d = createInterface(db, { nome: "Domande", spec: null, prompt: null, messages: [{ role: "user", content: "quanti ordini?" }] });
  expect(d).toMatchObject({ nome: "Domande", latestVersion: null, versions: [] });
  expect(listMessages(db, d.id)).toHaveLength(1);
  const heading = { id: "root", parentId: null, type: "heading" as const, text: "Ciao", level: 1 as const };
  expect(addVersion(db, d.id, { spec: { title: "T", variables: [], nodes: [heading] }, prompt: "fammi una vista" })!.latestVersion).toBe(1);
});

test("conversations are told apart by what they produced: chat, view or mini webapp", () => {
  const db = openDb(":memory:");
  const chat = createInterface(db, { nome: "Domanda", spec: null, prompt: null });
  const view = createInterface(db, { nome: "Vista", spec: spec("V"), prompt: null });
  const collections = [{ name: "note", fields: [{ name: "testo", type: "text" as const, required: true, references: null }] }];
  const app = createInterface(db, { nome: "App", spec: { ...spec("A"), appId: "a1", collections }, prompt: null });
  const kinds = Object.fromEntries(listInterfaces(db).map((i) => [i.id, i.kind]));
  expect(kinds).toEqual({ [chat.id]: "chat", [view.id]: "view", [app.id]: "app" });
  addVersion(db, view.id, { spec: { ...spec("V2"), appId: "a2", collections }, prompt: null });
  expect(getInterface(db, view.id)!.kind).toBe("app"); // the latest version decides
});
