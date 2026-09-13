const URL_PATTERN = /https?:\/\/[^\s,]+/gi;

function cleanUrl(value) {
  return value.replace(/[\])}>.;]+$/g, "");
}

export function extractProductUrls(value) {
  const matches = String(value || "").match(URL_PATTERN) || [];
  const urls = [];
  const seen = new Set();

  for (const match of matches) {
    const candidate = cleanUrl(match);
    try {
      const parsed = new URL(candidate);
      if (!["http:", "https:"].includes(parsed.protocol) || seen.has(parsed.href)) {
        continue;
      }
      seen.add(parsed.href);
      urls.push(parsed.href);
    } catch {
      // Invalid pasted fragments are ignored; the UI reports when no URL remains.
    }
  }

  return urls;
}

export function productUrlLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, run));
  return results;
}
