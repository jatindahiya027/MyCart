"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import Header from "./components/Header";
import ItemCard from "./components/ItemCard";
export default function Home() {
  // const [items] = useState([
  //   {
  //     image: " https://m.media-amazon.com/images/I/71UlEDZPiCL._SX425_.jpg", // replace with actual image paths
  //     link: "https://www.amazon.com",
  //     brand: "Amazon",
  //     name: "Boldfit Shoe Bag for Travel & Storage Travel Organizer for Women & Men Travel Accessories Shoe Organizer Shoe Bags Pouches Travel Shoe Cover for Travelling Travel Essentials",
  //     highPrice: 2000,
  //     lowPrice: 100,
  //     discountPercentage: 83,
  //     discountedPrice: 1000,
  //     currentPrice: 98,
  //     dateAdded: "18/09/2023",
  //   },
  //   {
  //     image:
  //       " https://assets.ajio.com/medias/sys_master/root/20230512/nLEs/645e55f842f9e729d77cb386/-473Wx593H-469477464-white-MODEL.jpg", // replace with actual image paths
  //     link: "https://www.amazon.com",
  //     brand: "Ajio",
  //     name: "Men Logo Embroidered Slim Fit Shirt",
  //     highPrice: 2000,
  //     lowPrice: 100,
  //     discountPercentage: 83,
  //     discountedPrice: 1000,
  //     currentPrice: 1889,
  //     dateAdded: "18/09/2023",
  //   },
  //   {
  //     image: "https://www.converse.in/media/catalog/product/m/5/m5039c-01.jpg", // replace with actual image paths
  //     link: "https://www.amazon.com",
  //     brand: "Converse",
  //     name: "Chuck Taylor All Star",
  //     highPrice: 2000,
  //     lowPrice: 100,
  //     discountPercentage: 83,
  //     discountedPrice: 1000,
  //     currentPrice: 3699,
  //     dateAdded: "18/09/2023",
  //   },
  //   {
  //     image:
  //       " https://img.tatacliq.com/images/i11/437Wx649H/MP000000008635112_437Wx649H_202305231842331.jpeg", // replace with actual image paths
  //     link: "https://www.amazon.com",
  //     brand: "tatacliq",
  //     name: "WES Casuals by Westside Aqua Relaxed-Fit Polo T-Shirt",
  //     highPrice: 2000,
  //     lowPrice: 100,
  //     discountPercentage: 83,
  //     discountedPrice: 1000,
  //     currentPrice: 699,
  //     dateAdded: "18/09/2023",
  //   },
  //   {
  //     image:
  //       " https://rukminim2.flixcart.com/image/416/416/xif0q/mobile/d/y/m/pixel-9-ga05843-in-google-original-imah3pfgd9zadkyx.jpeg?q=70&crop=false", // replace with actual image paths
  //     link: "https://www.amazon.com",
  //     brand: "flipkart",
  //     name: "Google Pixel 9 (Porcelain, 256 GB)  (12 GB RAM)",
  //     highPrice: 2000,
  //     lowPrice: 100,
  //     discountPercentage: 83,
  //     discountedPrice: 1000,
  //     currentPrice: 1000,
  //     dateAdded: "18/09/2023",
  //   },
  //   {
  //     image:
  //       "https://assets.myntassets.com/h_720,q_90,w_540/v1/assets/images/23912872/2023/8/1/15948d90-9a58-4c4c-88f8-5100418055871690870387068BonacureRepairRescueHairmaskwithArginineforDryandDamagedHair1.jpg", // replace with actual image paths
  //     link: "https://www.amazon.com",
  //     brand: "myntra",
  //     name: "Bonacure Repair Rescue Treatment Hair Mask with Arginine - 200ml",
  //     highPrice: 2000,
  //     lowPrice: 100,
  //     discountPercentage: 83,
  //     discountedPrice: 1000,
  //     currentPrice: 902,
  //     dateAdded: "18/09/2023",
  //   },
  //   {
  //     image:
  //       "https://static.zara.net/assets/public/353d/4755/e3d64d9ab19e/702062eae241/13208420800-a1/13208420800-a1.jpg?ts=1723556891665&w=249&f=auto", // replace with actual image paths
  //     link: "https://www.amazon.com",
  //     brand: "zara",
  //     name: "RUBBERISED MULTI-POCKET BACKPACK",
  //     highPrice: 2000,
  //     lowPrice: 100,
  //     discountPercentage: 83,
  //     discountedPrice: 1000,
  //     currentPrice: 13950,
  //     dateAdded: "18/09/2023",
  //   },
  // ]);
  const [itemdata, setitemdata] = useState([]);
  const [isVisible, setIsVisible] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState('Relevance');

  const handleChange = (event) => {
    setSelectedOption(event.target.value);
    // You can also handle sorting logic here based on selected value
  };
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      toggleVisibility();
      console.log('Enter key pressed!');
      // Call your function here
      enterdata();
    }
  };
function enterdata (){
  const scrapeData = async () => {
    const link = inputValue;
    await fetch('/api/scrape',{method: "POST",
      body: JSON.stringify({link }),
    }).then((res) => res.json())
    .then((data) => setitemdata(data))
    .catch((error) => {
      console.error(`Error fetching data from db:`, error);
    });
  };

  scrapeData();
}

const fetchdata = async()=>{
  await fetch('/api/data',{method:'POST',body: JSON.stringify({selectedOption}),})
  .then((res) => res.json())
  .then((data) => setitemdata(data))
  .catch((error) => {
    console.error(`Error fetching data from db:`, error);
  });    
}

const fetchupdateddata = async()=>{
  await fetch('/api/updatedata',{method:'POST'})
  .then((res) => res.json())
  .then((data) => setitemdata(data))
  .catch((error) => {
    console.error(`Error fetching data from db:`, error);
  });    
}
useEffect(() => {
  fetchdata();
  return () => {
    // console.log("got the data");
  };
  
},[selectedOption]);
const toggleVisibility = () => {
  setIsVisible(!isVisible); // Toggle visibility
  setInputValue(null);
};
// console.log(itemdata);
  return (
    
    <div className="container">
    <Header />
    {isVisible ?  <>
      <div className="item-list">
        <div className="info">
          <div className="info-div">
            <p className="margin font-we">{itemdata.length} items found</p>
            <button className="item-color margin" onClick={fetchupdateddata}><Image
               alt='reload'
                src="/reload.png"
                height={15}
                width={15}
              /></button>
          </div>
          <div className="info-div">
            <p className="margin font-we">Sort By</p>
            <select className="item-color margin length" value={selectedOption}
      onChange={handleChange}>
              <option value="Relevance">Relevance</option>
              <option value="Price (Highest first)">Price (Highest first)</option>
              <option value="Price (Lowest first)">Price (Lowest first)</option>
              <option value="Date (Highest first)">Date (Highest first)</option>
              <option value="Date (Lowest first)">Date (Lowest first)</option>
            </select>
            <button className="item-color info-div font-we " onClick={toggleVisibility}>
              Add{" "}
              <Image
                alt="+"
                className="marginl"
                src="/add.png"
                height={15}
                width={15}
              />
            </button>
          </div>
        </div>
        {itemdata.map((itemdata, index) => (
          <ItemCard key={itemdata.transid} item={itemdata} setitemdata={setitemdata} selectedOption={selectedOption}/>
        ))}
      </div></>:<div className='insertdata'>
      <button onClick={toggleVisibility}><Image
      alt='cross'
      src='/close.png'
      width='40'
      height='40'
      /></button>
      <input type="text" value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
         placeholder="Enter URL"  />
      
      </div>}
    </div>
  );
}
