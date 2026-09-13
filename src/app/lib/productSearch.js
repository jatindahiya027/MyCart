export function matchesSearchText(value, query) {
  if (!value) return false;

  const text = String(value).toLowerCase();
  const normalizedText = text.replace(/[^a-z0-9]+/g, " ");
  const normalizedQuery = String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalizedQuery) return true;
  return text.includes(String(query).toLowerCase()) || normalizedText.includes(normalizedQuery);
}

export function filterProducts(items, query) {
  if (!Array.isArray(items)) return [];
  const searchText = String(query || "").trim();
  if (!searchText) return items;

  return items.filter(
    (item) =>
      matchesSearchText(item?.name, searchText) ||
      matchesSearchText(item?.website, searchText) ||
      matchesSearchText(item?.link, searchText)
  );
}
