const VEGNONVEG_COMPLETE_RENDITION = "680X800";

export function normalizeProductImageUrl(value) {
  const source = String(value || "").trim();
  if (!source) return source;

  try {
    const url = new URL(source);
    if (url.hostname !== "images.vegnonveg.com") return source;

    const sizeMatch = url.pathname.match(/\/resized\/(\d+)[xX](\d+)\//);
    if (!sizeMatch) return source;
    const width = Number(sizeMatch[1]);
    const height = Number(sizeMatch[2]);
    if (!width || !height || width / height >= 0.8) return source;

    url.pathname = url.pathname.replace(
      sizeMatch[0],
      `/resized/${VEGNONVEG_COMPLETE_RENDITION}/`
    );
    return url.href;
  } catch {
    return source;
  }
}

export function normalizeProductImages(items, field = "image") {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    ...item,
    [field]: normalizeProductImageUrl(item?.[field]),
  }));
}
