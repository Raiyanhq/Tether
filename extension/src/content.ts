// Read-only. Answers "what is selected?" when the panel asks. Never changes the host page.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "tether:getSelection") {
    sendResponse({ text: String(window.getSelection() ?? ""), url: location.href, title: document.title });
  }
});
