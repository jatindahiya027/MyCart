const DEFAULT_APP_URL = "http://localhost:3027";
const supportedSites = self.MYCART_SUPPORTED_SITES || [];

const storeCount = document.getElementById("store-count");
const storeTitle = document.getElementById("current-store-title");
const storeDomain = document.getElementById("current-store-domain");
const storeInitial = document.getElementById("store-initial");
const storeIconImage = document.getElementById("store-icon-image");
const notice = document.getElementById("notice");
const trackButton = document.getElementById("track-product");
const trackLabel = document.getElementById("track-label");
const buttonSpinner = document.getElementById("button-spinner");
const productResult = document.getElementById("product-result");
const productImage = document.getElementById("product-image");
const productName = document.getElementById("product-name");
const productPrice = document.getElementById("product-price");
const appAddress = document.getElementById("app-address");

let currentTab = null;
let currentStore = null;
let appUrl = DEFAULT_APP_URL;

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

function faviconUrl(hostname) {
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${hostname}`)}&sz=64`;
}

function setNotice(message, state) {
  notice.textContent = message;
  notice.dataset.state = state;
}

function setProcessing(processing) {
  trackButton.disabled = processing || !currentStore;
  buttonSpinner.hidden = !processing;
  trackLabel.textContent = processing ? "Scraping product…" : "Track this product";
}

function showProduct(product) {
  productImage.src = product.image;
  productImage.alt = product.name;
  productName.textContent = product.name;
  productPrice.textContent = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(product.price);
  productResult.hidden = false;
}

function openAppPath(path = "") {
  chrome.tabs.create({ url: `${appUrl}${path}` });
}

async function initialize() {
  storeCount.textContent = `${supportedSites.length} stores`;
  ({ appUrl } = await chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }));
  appUrl = String(appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
  appAddress.textContent = appUrl;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab || null;
  currentStore = findSupportedSite(tab?.url);

  if (!currentStore) {
    let hostname = "This website";
    try {
      hostname = new URL(tab?.url).hostname || hostname;
    } catch {
      // Browser-owned pages do not have a normal website URL.
    }
    storeTitle.textContent = "Website not supported";
    storeDomain.textContent = hostname;
    storeInitial.textContent = "!";
    setNotice(`${hostname} is not supported by MyCart.`, "error");
    trackButton.disabled = true;
    chrome.runtime.sendMessage({
      type: "mycart:track-product",
      url: tab?.url || "",
      tabId: tab?.id,
    }).catch(() => {});
    window.setTimeout(() => {
      setNotice("Open a supported product page to track it.", "");
    }, 1000);
    return;
  }

  storeTitle.textContent = currentStore.name;
  storeDomain.textContent = currentStore.hostname;
  storeInitial.textContent = currentStore.name.charAt(0).toUpperCase();
  storeIconImage.src = faviconUrl(currentStore.hostname);
  storeIconImage.hidden = false;
  storeIconImage.addEventListener("error", () => {
    storeIconImage.hidden = true;
  });
  setNotice("This website is supported. Track the current product page when ready.", "supported");
  trackButton.disabled = false;
}

trackButton.addEventListener("click", async () => {
  if (!currentTab?.url || !currentStore) return;
  productResult.hidden = true;
  setProcessing(true);
  setNotice(`Scraping ${currentStore.name}. You can close this popup.`, "processing");

  try {
    const result = await chrome.runtime.sendMessage({
      type: "mycart:track-product",
      url: currentTab.url,
      tabId: currentTab.id,
    });
    if (!result?.ok || !result?.product) {
      throw new Error(result?.error || "Could not add this product.");
    }
    showProduct(result.product);
    setNotice("The product was added and your open MyCart page was updated.", "supported");
  } catch (error) {
    setNotice(error?.message || "Could not reach MyCart.", "error");
  } finally {
    setProcessing(false);
  }
});

document.getElementById("open-app").addEventListener("click", () => openAppPath());
document.getElementById("view-supported").addEventListener("click", () => openAppPath("/supported-sites"));
document.getElementById("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

initialize().catch((error) => {
  setNotice(error?.message || "Could not inspect this page.", "error");
});
