// Pinned demo inputs so nothing depends on finding content live.
import demoLessonJson from "../../../seed/demo-lesson.json";
import { LessonSchema } from "./schemas";

export const DEMO_PARAGRAPH =
  "Amortized analysis bounds the cost of a sequence of operations rather than any single one. Consider a dynamic array that doubles its capacity whenever it fills up. Most appends are constant time, but the occasional resize copies every existing element, which costs time proportional to the array's length. Taken in isolation, that resize looks expensive. However, because capacity doubles, resizes become exponentially rarer as the array grows, so the total copying work across n appends is bounded by a geometric series that sums to O(n). The amortized cost per append is therefore O(1), even though the worst-case cost of one append is O(n). This differs from average-case analysis, which relies on assumptions about the input distribution; amortized bounds hold for any sequence of operations, including adversarial ones.";

export const DEMO_PROBLEM = "Trace factorial(4) written recursively and show how the call stack unwinds.";

/** Offline copy used only when the server cannot be reached. */
export const DEMO_LESSON = LessonSchema.parse(demoLessonJson);

export const DEMO_DIAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520" font-family="Arial, sans-serif">
<rect width="900" height="520" fill="#ffffff"/>
<text x="450" y="38" text-anchor="middle" font-size="24" font-weight="bold" fill="#111">Cached request flow</text>
<g fill="#e8eefc" stroke="#2650b8" stroke-width="3">
<rect x="40" y="200" width="150" height="90" rx="10"/><rect x="330" y="200" width="150" height="90" rx="10"/>
<rect x="330" y="400" width="150" height="90" rx="10"/><rect x="710" y="200" width="150" height="90" rx="10"/></g>
<g font-size="22" text-anchor="middle" fill="#111"><text x="115" y="252">Browser</text><text x="405" y="252">Cache</text>
<text x="405" y="452">Server</text><text x="785" y="252">Database</text></g>
<g stroke="#222" stroke-width="3" fill="none" marker-end="url(#a)">
<path d="M190 235 L328 235"/><path d="M405 292 L405 398"/><path d="M482 450 Q640 450 640 300 L708 260"/><path d="M330 275 Q250 360 190 285" stroke-dasharray="8 6"/></g>
<defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#222"/></marker></defs>
<g font-size="22" font-weight="bold" fill="#b00020" text-anchor="middle">
<text x="259" y="222">A</text><text x="430" y="352">B</text><text x="600" y="430">C</text><text x="240" y="352">D</text></g>
<text x="450" y="500" font-size="16" fill="#444" text-anchor="middle">Arrow labels: A request, B cache miss, C query, D cached reply</text>
</svg>`;
