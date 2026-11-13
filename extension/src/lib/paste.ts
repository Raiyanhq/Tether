/**
 * The image from a paste event (for example a screenshot), or null.
 * Pastes that also carry text are left alone, so copying from a document still pastes the text normally.
 */
export function imageFromClipboard(e: ClipboardEvent): File | null {
  const data = e.clipboardData;
  if (!data) return null;
  if (data.getData("text/plain").trim()) return null;
  return [...data.files].find((f) => f.type.startsWith("image/")) ?? null;
}
