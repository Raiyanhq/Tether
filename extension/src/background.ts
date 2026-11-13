const MENU_ID = "tether-send";
const PDF_VIEWER = "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("Tether: could not set panel behavior", err));
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: "Send to Tether", contexts: ["selection"] });
  });
});

function isPdf(url: string): boolean {
  return url.startsWith(PDF_VIEWER) || /\.pdf($|[?#])/i.test(url);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  // sidePanel.open must run synchronously inside the user gesture, before any await.
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => console.error("Tether: could not open panel", err));

  const url = info.pageUrl || tab.url || "";
  const pending = isPdf(url)
    ? { kind: "pdf", at: Date.now() }
    : { kind: "text", text: info.selectionText ?? "", url, title: tab.title ?? url, at: Date.now() };
  void chrome.storage.session.set({ pendingSelection: pending });
});
