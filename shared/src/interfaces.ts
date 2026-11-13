import type { GenerateUsage } from "./llm";
import type { Spec } from "./spec";

/** A saved conversation. `latestVersion` is null until it produces its first interface (e.g. it only asked questions so far). */
/** What a conversation has produced so far: a mini webapp with its own data, a view on existing data, or only chat. */
export type ConversationKind = "app" | "view" | "chat";
export type InterfaceSummary = {
  id: number; nome: string; descrizione: string | null; updatedAt: string; latestVersion: number | null; kind: ConversationKind;
  pinned: boolean; archived: boolean;
  /** Set while the conversation's app has a public link: the token that link carries. */
  shareToken: string | null;
};
export type InterfaceDetail = InterfaceSummary & { versions: { numero: number; prompt: string | null; createdAt: string }[] };
export type InterfaceVersion = { numero: number; spec: Spec; prompt: string | null; createdAt: string };

/** A chat turn as stored with an interface. Attachments are kept by name only. */
export type ChatMessage = {
  role: "user" | "assistant"; content: string; attachments?: string[];
  /** Assistant turns: the reasoning shown for the answer, and what the generation consumed. */
  thinking?: string; usage?: GenerateUsage;
};
export type StoredMessage = ChatMessage & { attachments: string[]; createdAt: string };
