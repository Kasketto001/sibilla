export type Attachment = { name: string; mediaType: string; data: string };

export const MAX_FILE = 10 * 1024 * 1024;
/** Pastes at least this long go in as an attachment instead of filling the textbox. */
export const LONG_PASTE = 1500;

const IMAGE = /^image\/(png|jpeg|gif|webp)$/;
const TEXT_EXT: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", csv: "text/csv", tsv: "text/tab-separated-values",
  json: "application/json", xml: "application/xml", html: "text/html", log: "text/plain",
};

export const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,application/pdf,.txt,.md,.csv,.tsv,.json,.xml,.html,.log";

function mediaTypeOf(f: File): string | null {
  if (IMAGE.test(f.type) || f.type === "application/pdf") return f.type;
  if (f.type.startsWith("text/") || f.type === "application/json" || f.type === "application/xml") return f.type;
  return TEXT_EXT[f.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

async function base64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function fileToAttachment(f: File): Promise<Attachment> {
  const mediaType = mediaTypeOf(f);
  if (!mediaType) throw new Error(`«${f.name}» non è supportato: usa immagini, PDF o file di testo (txt, md, csv, json).`);
  if (f.size > MAX_FILE) throw new Error(`«${f.name}» supera i 10 MB.`);
  const binary = IMAGE.test(mediaType) || mediaType === "application/pdf";
  return { name: f.name, mediaType, data: binary ? await base64(f) : await f.text() };
}

export function pastedTextAttachment(text: string): Attachment | null {
  return text.length >= LONG_PASTE ? { name: "Testo incollato", mediaType: "text/plain", data: text } : null;
}
