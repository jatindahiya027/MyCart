import React from 'react';
import Image from "next/image";

const Header = () => {
  return (
    <header className="header">
      <div className="logo">
        <Image className="image" alt="image" src="/logo.png" height={40} width={40} />
        MyCart
      </div>
      <div className="search-container">
        <div className="search-bar">
          <input type="text" placeholder="Search" />
          <Image className="image" alt="image" src="/search.png" height={20} width={20} />
        </div>
      </div>
    </header>
  );
};

export default Header;
