const DEFAULT_APP_URL = "http://localhost:3027";
const input = document.getElementById("app-url");
const status = document.getElementById("status");

chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }).then(({ appUrl }) => {
  input.value = appUrl;
});

document.getElementById("save").addEventListener("click", async () => {
  try {
    const url = new URL(input.value.trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    const originPattern = `${url.origin}/*`;
    const permitted = await chrome.permissions.contains({ origins: [originPattern] });
    if (!permitted) {
      const granted = await chrome.permissions.request({ origins: [originPattern] });
      if (!granted) {
        status.textContent = "Permission was not granted";
        return;
      }
    }
    await chrome.storage.sync.set({ appUrl: url.href.replace(/\/$/, "") });
    status.textContent = "Saved";
    window.setTimeout(() => { status.textContent = ""; }, 1800);
  } catch {
    status.textContent = "Enter a valid app URL";
  }
});
