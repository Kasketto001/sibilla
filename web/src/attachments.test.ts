import { expect, test } from "vitest";
import { fileToAttachment, pastedTextAttachment, LONG_PASTE } from "./attachments";

test("image files become base64 attachments without the data url prefix", async () => {
  const f = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
  expect(await fileToAttachment(f)).toEqual({ name: "a.png", mediaType: "image/png", data: "AQID" });
});

test("text files are read as text", async () => {
  const f = new File(["x,y\n1,2"], "d.csv", { type: "text/csv" });
  expect(await fileToAttachment(f)).toEqual({ name: "d.csv", mediaType: "text/csv", data: "x,y\n1,2" });
});

test("markdown and files without a type are treated as text by extension", async () => {
  expect((await fileToAttachment(new File(["# t"], "n.md", { type: "" }))).mediaType).toBe("text/markdown");
});

test("unsupported files are rejected with a readable error", async () => {
  await expect(fileToAttachment(new File(["x"], "a.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })))
    .rejects.toThrow(/a\.docx/);
});

test("too large files are rejected", async () => {
  await expect(fileToAttachment(new File([new Uint8Array(11_000_000)], "big.pdf", { type: "application/pdf" }))).rejects.toThrow(/10 MB/);
});

test("only long pastes become attachments", () => {
  expect(pastedTextAttachment("breve")).toBeNull();
  const long = "a".repeat(LONG_PASTE);
  expect(pastedTextAttachment(long)).toMatchObject({ mediaType: "text/plain", data: long, name: "Testo incollato" });
});
