"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import Image from "next/image";
import { storeFaviconUrl } from "../lib/supportedSites";

function StoreIcon({ store }) {
  const initial = store.name.trim().charAt(0).toUpperCase();

  return (
    <span className="store-directory-icon" aria-hidden="true">
      <span>{initial}</span>
      <Image
        src={storeFaviconUrl(store.hostname)}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
    </span>
  );
}

export default function SupportedSitesDirectory({ stores }) {
  const [query, setQuery] = useState("");
  const sortedStores = useMemo(
    () => [...stores].sort((left, right) => left.name.localeCompare(right.name)),
    [stores]
  );
  const filteredStores = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sortedStores;
    return sortedStores.filter((store) =>
      [store.name, store.hostname, ...(store.aliases || [])].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    );
  }, [query, sortedStores]);

  return (
    <section className="supported-directory" aria-labelledby="supported-sites-title">
      <div className="supported-directory-heading">
        <div>
          <h1 id="supported-sites-title">Supported websites</h1>
          <p>
            MyCart accepts product links from {stores.length} registered stores.
          </p>
        </div>
        <span className="supported-directory-count">
          {filteredStores.length === stores.length
            ? `${stores.length} stores`
            : `${filteredStores.length} of ${stores.length}`}
        </span>
      </div>

      <label className="supported-directory-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search supported websites</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by store or domain"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear store search">
            <X size={14} />
          </button>
        )}
      </label>

      {filteredStores.length ? (
        <div className="supported-sites-grid">
          {filteredStores.map((store) => (
            <a
              className="supported-site-row"
              href={store.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              key={store.site}
            >
              <StoreIcon store={store} />
              <span className="supported-site-copy">
                <strong>{store.name}</strong>
                <span>{store.hostname}</span>
              </span>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        <div className="supported-directory-empty">
          <strong>No supported website matches “{query}”.</strong>
          <span>Check the spelling or paste the product URL on the home page.</span>
        </div>
      )}
    </section>
  );
}
