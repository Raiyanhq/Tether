// Change at build time: VITE_SERVER_URL=https://your-host npm run build
// (also add that origin to host_permissions in public/manifest.json)
export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "http://localhost:8787";
export const MAX_TEXT_CHARS = 6000;
export const DEV_TOOLS = import.meta.env.VITE_DEV_TOOLS === "1";
/** True when the app runs inside the in-page bubble (iframe) rather than the side panel. */
export const IS_BUBBLE = new URLSearchParams(location.search).get("mode") === "bubble";
