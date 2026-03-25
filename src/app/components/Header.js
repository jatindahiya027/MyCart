import React, { useState } from 'react';
import Image from "next/image";
import { MeiliSearch } from 'meilisearch';

// Initialize Meilisearch client
const client = new MeiliSearch({
  host: 'http://127.0.0.1:7700',
  apiKey: 'your_api_key',
});

const Header = ({ itemdata, setitemdata, selectedOption }) => {
  const [query, setQuery] = useState('');

  const fetchdata = async () => {
    await fetch("/api/data", {
      method: "POST",
      body: JSON.stringify({ selectedOption }),
    })
      .then((res) => res.json())
      .then((data) => setitemdata(data))
      .catch((error) => {
        console.error("Error fetching data from db:", error);
      });
  };

  const handleSearch = async (searchText) => {
    if (!searchText) {
      fetchdata();
      return;
    }
    try {
      const index = client.index('mycart');
      const searchResults = await index.search(searchText, { limit: 100 });
      setitemdata(searchResults.hits);
    } catch (error) {
      console.error('Error searching:', error);
    }
  };

  const handleInputChange = (e) => {
    const searchText = e.target.value;
    setQuery(searchText);
    handleSearch(searchText);
  };

  return (
    <header className="header">
      <div className="logo">
        <Image className="image" alt="MyCart logo" src="/logo.png" height={28} width={28} />
        MyCart
      </div>

      <div className="search-container">
        <div className="search-bar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search items…"
            value={query}
            onChange={handleInputChange}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); fetchdata(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '2px',
                flexShrink: 0,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
