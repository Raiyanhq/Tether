export interface PreparedImage { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp"; dataUrl: string }

const MAX_SIDE = 1600;

/** Resize client-side to at most 1600px on the long side, then return base64 without the data: prefix. */
export async function prepareImage(blob: Blob): Promise<PreparedImage> {
  if (!blob.type.startsWith("image/")) throw new Error("That file is not an image.");
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(blob); } catch { throw new Error("Could not read that image. Try a PNG or JPEG."); }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // Flatten transparency onto white so diagrams stay readable as JPEG.
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  const mediaType = blob.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(mediaType, 0.88);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType, dataUrl };
}

export async function svgToBlob(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 900; canvas.height = img.naturalHeight || 520;
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no blob"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
