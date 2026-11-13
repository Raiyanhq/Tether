// Side panels can't always show the microphone prompt. This normal tab can; once allowed, the panel can use the mic.
const msg = document.getElementById("msg");
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((s) => { s.getTracks().forEach((t) => t.stop()); msg.textContent = "Microphone allowed. You can close this tab and go back to Tether."; })
  .catch(() => { msg.textContent = "Microphone was blocked. Allow it in the address bar (lock icon), then reload this tab. Typing still works in Tether."; });
