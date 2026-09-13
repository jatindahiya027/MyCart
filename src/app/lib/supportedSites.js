import { SUPPORTED_STORES } from "./supportedSites.generated.js";

function normalizedHost(value) {
  return String(value || "").toLowerCase().replace(/^www\./, "");
}

const HOST_TO_STORE = new Map(
  SUPPORTED_STORES.flatMap((store) =>
    [store.hostname, ...(store.aliases || [])].map((hostname) => [
      normalizedHost(hostname),
      store,
    ])
  )
);

const SORTED_HOSTS = [...HOST_TO_STORE.keys()].sort(
  (left, right) => right.length - left.length
);

export function findSupportedStore(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  const hostname = normalizedHost(parsed.hostname);
  const registeredHost = SORTED_HOSTS.find(
    (candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`)
  );
  return registeredHost ? HOST_TO_STORE.get(registeredHost) : null;
}

export function unsupportedStoreMessage(value) {
  try {
    const hostname = new URL(value).hostname;
    return `${hostname} is not supported by MyCart.`;
  } catch {
    return "Enter a complete http(s) product URL.";
  }
}

export function storeFaviconUrl(hostname) {
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
    `https://${hostname}`
  )}&sz=64`;
}

export { SUPPORTED_STORES };
