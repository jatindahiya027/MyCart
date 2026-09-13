importScripts("supported-sites.js");

const MENU_ID = "mycart-add-product";
const DEFAULT_APP_URL = "http://localhost:3027";
const supportedSites = self.MYCART_SUPPORTED_SITES || [];
const supportedHosts = new Set(self.MYCART_SUPPORTED_HOSTS || []);

function normalizedHost(value) {
  return String(value || "").toLowerCase().replace(/^www\./, "");
}

function findSupportedSite(value) {
  try {
    const host = normalizedHost(new URL(value).hostname);
    return supportedSites.find((site) =>
      [site.hostname, ...(site.aliases || [])].some((candidate) => {
        const normalizedCandidate = normalizedHost(candidate);
        return host === normalizedCandidate || host.endsWith(`.${normalizedCandidate}`);
      })
    ) || null;
  } catch {
    return null;
  }
}

function isSupportedUrl(value) {
  return Boolean(findSupportedSite(value));
}

function menuPatterns() {
  return [...supportedHosts].flatMap((host) => [
    `*://${host}/*`,
    `*://*.${host}/*`,
  ]);
}

async function createMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Track this product in MyCart",
    contexts: ["page"],
    documentUrlPatterns: menuPatterns(),
  });
}

function showResultCard(state) {
  document.getElementById("mycart-extension-result")?.remove();
  const host = document.createElement("div");
  host.id = "mycart-extension-result";
  const shadow = host.attachShadow({ mode: "open" });
  const card = document.createElement("aside");
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");

  const status = state?.status || "error";
  const product = state?.product || null;
  const isProcessing = status === "processing";
  const isSuccess = status === "success" && product;
  const price = isSuccess
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(product.price)
    : "";

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      aside {
        position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
        display: grid; grid-template-columns: ${isSuccess ? "68px 1fr" : isProcessing ? "34px 1fr" : "1fr"}; gap: 12px;
        width: min(360px, calc(100vw - 36px)); padding: 13px;
        border: 1px solid #e8e5df; border-radius: 12px; background: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,.14); color: #1a1917;
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transition: opacity 220ms ease-out, transform 220ms cubic-bezier(.22,1,.36,1);
      }
      aside.mycart-is-dismissing {
        opacity: 0; transform: translateY(6px); pointer-events: none;
      }
      img { width: 68px; height: 76px; border-radius: 8px; object-fit: contain; background: #f5f4f2; }
      .spinner {
        width: 28px; height: 28px; margin-top: 2px; border: 3px solid #e8e5df;
        border-top-color: #0241e2; border-radius: 50%; animation: mycart-spin .8s linear infinite;
      }
      .eyebrow { margin-bottom: 3px; color: ${isSuccess ? "#1a8a4a" : isProcessing ? "#0241e2" : "#e02020"}; font-size: 11px; font-weight: 700; }
      .name { margin: 0; overflow: hidden; font-weight: 650; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .price { margin-top: 7px; color: #0241e2; font-size: 17px; font-weight: 750; }
      .detail { margin: 3px 0 0; color: #6b6760; overflow-wrap: anywhere; }
      button { position: absolute; top: 7px; right: 7px; border: 0; background: transparent; color: #6b6760; cursor: pointer; font-size: 18px; }
      @keyframes mycart-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        aside { transition: none; }
        .spinner { animation-duration: 1.8s; }
      }
    </style>
  `;

  if (isSuccess) {
    const image = document.createElement("img");
    image.src = product.image;
    image.alt = "";
    card.append(image);
  } else if (isProcessing) {
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    card.append(spinner);
  }

  const copy = document.createElement("div");
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = isSuccess
    ? "Price scraped and saved"
    : isProcessing
    ? "Adding to MyCart"
    : "Could not add product";
  copy.append(eyebrow);

  if (isSuccess) {
    const name = document.createElement("p");
    name.className = "name";
    name.textContent = product.name;
    const priceElement = document.createElement("div");
    priceElement.className = "price";
    priceElement.textContent = price;
    copy.append(name, priceElement);
  } else {
    const detail = document.createElement("p");
    detail.className = "detail";
    detail.textContent = isProcessing
      ? `Scraping ${state?.storeName || "this website"}. You can keep browsing.`
      : state?.errorMessage || "The MyCart app could not be reached.";
    copy.append(detail);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss MyCart result");
  close.textContent = "×";
  const prefersReducedMotion = Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );
  const fadeDuration = prefersReducedMotion
    ? 0
    : Math.max(0, Number(state?.fadeDurationMs ?? 220));
  let isDismissing = false;
  const beginDismiss = () => {
    if (isDismissing || !host.isConnected) return;
    isDismissing = true;
    card.classList.add("mycart-is-dismissing");
    window.setTimeout(() => host.remove(), fadeDuration);
  };
  close.addEventListener("click", beginDismiss);
  card.append(copy, close);
  shadow.append(card);
  document.documentElement.append(host);

  const timeout = state?.autoDismissMs || (isProcessing ? 155000 : isSuccess ? 5000 : 14000);
  window.setTimeout(beginDismiss, Math.max(0, timeout - fadeDuration));
}

async function showInTab(tabId, state) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showResultCard,
      args: [state],
    });
  } catch {
    // Some browser-owned pages do not permit injected UI. Scraping can still continue.
  }
}

async function notifyOpenMyCartTabs(appUrl) {
  try {
    const parsed = new URL(appUrl);
    const origin = parsed.origin;
    const tabs = await chrome.tabs.query({
      url: `${parsed.protocol}//${parsed.hostname}/*`,
    });
    const matchingTabs = tabs.filter(
      (tab) => tab.url === origin || tab.url?.startsWith(`${origin}/`)
    );
    await Promise.all(
      matchingTabs.map((tab) =>
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.dispatchEvent(new CustomEvent("mycart:product-added")),
        })
      )
    );
  } catch {
    // The app also refreshes on focus, so a notification failure is recoverable.
  }
}

async function trackProduct(productUrl, tabId) {
  const store = findSupportedSite(productUrl);
  if (!store) {
    const errorMessage = (() => {
      try {
        return `${new URL(productUrl).hostname} is not supported by MyCart.`;
      } catch {
        return "This page does not have a valid product URL.";
      }
    })();
    await showInTab(tabId, {
      status: "error",
      errorMessage,
      autoDismissMs: 1000,
    });
    return { ok: false, error: errorMessage };
  }

  await showInTab(tabId, {
    status: "processing",
    storeName: store.name,
  });

  try {
    const settings = await chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL });
    const appUrl = String(settings.appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
    const response = await fetch(`${appUrl}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link: productUrl, details: true }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.error || !payload?.product) {
      throw new Error(payload?.error || `MyCart returned HTTP ${response.status}.`);
    }

    await Promise.all([
      showInTab(tabId, {
        status: "success",
        product: payload.product,
        autoDismissMs: 5000,
        fadeDurationMs: 220,
      }),
      notifyOpenMyCartTabs(appUrl),
    ]);
    return { ok: true, product: payload.product, store };
  } catch (error) {
    const errorMessage = error?.message || "Could not reach MyCart.";
    await showInTab(tabId, { status: "error", errorMessage });
    return { ok: false, error: errorMessage, store };
  }
}

chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !isSupportedUrl(info.pageUrl)) return;
  trackProduct(info.pageUrl, tab?.id);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "mycart:track-product") return false;
  trackProduct(message.url, message.tabId).then(sendResponse);
  return true;
});

createMenu();
