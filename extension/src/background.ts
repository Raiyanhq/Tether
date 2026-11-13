const MENU_ID = "tether-send";
const PDF_VIEWER = "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai";

chrome.runtime.onInstalled.addListener(() => {
  // The toolbar icon opens the in-page bubble; the side panel is only the fallback for pages that block it.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((err) => console.error("Tether: could not set panel behavior", err));
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: "Send to Tether", contexts: ["selection"] });
  });
});

function isPdf(url: string): boolean {
  return url.startsWith(PDF_VIEWER) || /\.pdf($|[?#])/i.test(url);
}

/** Pages where Chrome won't run content scripts, or where the bubble can't be drawn. */
function needsSidePanel(url: string): boolean {
  return !/^https?:/i.test(url) || /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i.test(url) || isPdf(url);
}

/** Tells the page's content script to show or toggle the bubble. Injects it first if the tab predates the install. */
async function sendToTab(tabId: number, type: "tether:toggle" | "tether:show"): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type });
    return true;
  } catch { /* no content script in this tab yet */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tabId, { type });
    return true;
  } catch (err) {
    console.error("Tether: could not open the bubble on this page", err);
    return false;
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  if (needsSidePanel(tab.url ?? "")) {
    // sidePanel.open must run synchronously inside the user gesture, before any await.
    chrome.sidePanel.open({ tabId: tab.id }).catch((err) => console.error("Tether: could not open panel", err));
    return;
  }
  void sendToTab(tab.id, "tether:toggle");
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const url = info.pageUrl || tab.url || "";
  const pdf = isPdf(url);
  if (pdf || needsSidePanel(tab.url ?? url)) {
    chrome.sidePanel.open({ tabId: tab.id }).catch((err) => console.error("Tether: could not open panel", err));
  } else {
    void sendToTab(tab.id, "tether:show");
  }

  const pending = pdf
    ? { kind: "pdf", at: Date.now() }
    : { kind: "text", text: info.selectionText ?? "", url, title: tab.title ?? url, at: Date.now() };
  void chrome.storage.session.set({ pendingSelection: pending });
});
