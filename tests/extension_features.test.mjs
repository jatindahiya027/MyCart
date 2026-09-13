import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const supportedSitesSource = readFileSync(
  new URL("../browser-extension/supported-sites.js", import.meta.url),
  "utf8"
);
const serviceWorkerSource = readFileSync(
  new URL("../browser-extension/service-worker.js", import.meta.url),
  "utf8"
);
const manifest = JSON.parse(
  readFileSync(new URL("../browser-extension/manifest.json", import.meta.url), "utf8")
);
function extensionHarness(fetchImplementation) {
  const injected = [];
  const queriedPatterns = [];
  let messageListener = null;

  const context = {
    URL,
    Set,
    Intl,
    Promise,
    console,
    fetch: fetchImplementation,
    self: {},
    importScripts: () => {},
    chrome: {
      contextMenus: {
        removeAll: async () => {},
        create: () => {},
        onClicked: { addListener: () => {} },
      },
      runtime: {
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onMessage: {
          addListener: (listener) => {
            messageListener = listener;
          },
        },
      },
      scripting: {
        executeScript: async (options) => {
          injected.push(options);
        },
      },
      storage: {
        sync: {
          get: async () => ({ appUrl: "http://localhost:3027" }),
        },
      },
      tabs: {
        query: async ({ url }) => {
          queriedPatterns.push(url);
          return [{ id: 99, url: "http://localhost:3027/" }];
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(supportedSitesSource, context);
  vm.runInContext(serviceWorkerSource, context);

  return {
    context,
    injected,
    queriedPatterns,
    send(message) {
      return new Promise((resolve) => {
        assert.equal(messageListener(message, null, resolve), true);
      });
    },
  };
}

test("extension reports processing, success, and refreshes open MyCart tabs", async () => {
  let fetchedUrl = null;
  const harness = extensionHarness(async (url) => {
    fetchedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        product: {
          name: "Samba OG Shoes",
          price: 10999,
          image: "https://assets.example.com/samba.jpg",
        },
      }),
    };
  });

  assert.equal(harness.context.self.MYCART_SUPPORTED_SITES.length, 223);
  const result = await harness.send({
    type: "mycart:track-product",
    url: "https://www.adidas.co.in/samba-og-shoes/B75806.html",
    tabId: 7,
  });

  const cardStates = harness.injected
    .map((entry) => entry.args?.[0])
    .filter(Boolean);
  assert.equal(cardStates[0].status, "processing");
  assert.equal(cardStates[0].storeName, "Adidas India");
  assert.equal(cardStates.at(-1).status, "success");
  assert.equal(cardStates.at(-1).autoDismissMs, 5000);
  assert.equal(cardStates.at(-1).fadeDurationMs, 220);
  assert.match(String(harness.injected[0].func), /mycart-is-dismissing/);
  assert.match(String(harness.injected[0].func), /beginDismiss/);
  assert.equal(result.ok, true);
  assert.equal(fetchedUrl, "http://localhost:3027/api/scrape");
  assert.deepEqual(harness.queriedPatterns, ["http://localhost/*"]);
  assert.ok(harness.injected.some((entry) => entry.target.tabId === 99));
});

test("extension rejects unsupported websites before calling MyCart", async () => {
  let fetchCount = 0;
  const harness = extensionHarness(async () => {
    fetchCount += 1;
    throw new Error("fetch should not run");
  });

  const result = await harness.send({
    type: "mycart:track-product",
    url: "https://example.com/product",
    tabId: 8,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /not supported by MyCart/);
  assert.equal(fetchCount, 0);
  assert.equal(harness.injected[0].args[0].status, "error");
  assert.equal(harness.injected[0].args[0].autoDismissMs, 1000);
});

test("extension declares real Chrome and toolbar icon assets", () => {
  assert.deepEqual(Object.keys(manifest.icons), ["16", "32", "48", "128"]);
  assert.equal(manifest.action.default_icon[16], "icons/icon-16.png");
  assert.equal(manifest.action.default_icon[32], "icons/icon-32.png");
  for (const iconPath of Object.values(manifest.icons)) {
    assert.equal(
      existsSync(new URL(`../browser-extension/${iconPath}`, import.meta.url)),
      true
    );
  }
});
