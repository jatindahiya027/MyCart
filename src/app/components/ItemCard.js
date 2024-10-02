import React from 'react';
import Image from "next/image";
const ItemCard = ({ item }) => {
  return (
    <div className="item-card">
      <div className="item-image">
        {/* <img src={item.image} alt={item.name} /> */}
        <Image className="image fixsize" alt={item.name} src={item.image}  height={140} width={100} />
      </div>
      <div className="item-info">
        
        <p className="brand">{item.brand}</p>
        
        <a href={item.link}>
        <h2  className="item-name">{item.name}</h2>
        </a>
        <p className="price-range">
          <span className="high-price">High: ₹{item.highPrice}</span> 
          <span className="low-price">Low: ₹{item.lowPrice}</span>
        </p>
        <p className="discount">
          {/* {item.discountPercentage}% / ₹{item.discountedPrice} */}
        </p>
        <p className="current-price">₹{item.currentPrice}</p>
      </div>
      <div className="item-footer">
        <p>{item.dateAdded}</p>
        <button className="delete-btn">🗑️</button>
      </div>
    </div>
  );
};

export default ItemCard;
