
import React, { useState } from 'react';
import Image from "next/image";
import { MeiliSearch } from 'meilisearch';
// Initialize Meilisearch client
const client = new MeiliSearch({
  host: 'http://127.0.0.1:7700', // Replace with your Meilisearch host
  apiKey: 'your_api_key',       // Replace with your API key
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
        console.error(`Error fetching data from db:`, error);
      });
  };
  const handleSearch = async (searchText) => {
    if (!searchText) {
      fetchdata();
      return;
    }

    // setIsLoading(true);
    try {
      const index = client.index('mycart'); // Replace 'movies' with your index name
      const searchResults = await index.search(searchText, {
        limit: 100, // Limit the number of results
      });
      setitemdata(searchResults.hits);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      // setIsLoading(false);
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    const searchText = e.target.value;
    setQuery(searchText);
    handleSearch(searchText);
  };

  return (
    <header className="header">
      <div className="logo">
        <Image className="image" alt="image" src="/logo.png" height={40} width={40} />
        MyCart
      </div>
      <div className="search-container">
        <div className="search-bar">
          <input type="text" placeholder="Search" value={query}
        onChange={handleInputChange} />
          <Image className="image" alt="image" src="/search.png" height={20} width={20} />
        </div>
      </div>
    </header>
  );
};

export default Header;
