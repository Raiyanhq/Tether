function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** The colour you actually see when `fg` at `alpha` is laid over `bg`. */
export function blend(fg: string, alpha: number, bg: string): string {
  const f = toRgb(fg), b = toRgb(bg);
  return toHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)));
}

export const hexToRgbTriplet = (hex: string) => toRgb(hex).join(", ");
