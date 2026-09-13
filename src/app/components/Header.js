"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ScrollText, Settings, Store, X } from 'lucide-react';

const Header = ({ query = null, onQueryChange = null }) => {
  const pathname = usePathname();
  const hasSearch = typeof query === "string" && typeof onQueryChange === "function";

  const handleInputChange = (e) => {
    onQueryChange(e.target.value);
  };

  const clearSearch = () => {
    onQueryChange("");
  };

  return (
    <header className="header">
      <Link href="/" className="logo" aria-label="MyCart home">
        <Image className="image" alt="MyCart logo" src="/logo.png" height={26} width={26} />
        MyCart
      </Link>

      {hasSearch ? (
        <div className="search-container">
          <div className="search-bar">
            <Search size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search items…"
              value={query}
              onChange={handleInputChange}
            />
            {query && (
              <button
                onClick={clearSearch}
                className="search-clear-btn"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="header-spacer" />
      )}

      <nav className="header-nav" aria-label="Primary navigation">
        <Link
          href="/supported-sites"
          className={`header-nav-link${pathname === "/supported-sites" ? " header-nav-link--active" : ""}`}
        >
          <Store size={15} />
          <span>Supported</span>
        </Link>
        <Link
          href="/logs"
          className={`header-nav-link${pathname === "/logs" ? " header-nav-link--active" : ""}`}
        >
          <ScrollText size={15} />
          <span>Logs</span>
        </Link>
        <Link
          href="/settings"
          className={`header-nav-link${pathname === "/settings" ? " header-nav-link--active" : ""}`}
        >
          <Settings size={15} />
          <span>Settings</span>
        </Link>
      </nav>
    </header>
  );
};

export default Header;
