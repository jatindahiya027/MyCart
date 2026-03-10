"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import Header from "./components/Header";
import ItemCard from "./components/ItemCard";
import { AnimatePresence, motion } from "framer-motion";

export default function Home() {
  const [itemdata, setitemdata] = useState([]);
  const [isVisible, setIsVisible] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [selectedOption, setSelectedOption] = useState("Relevance");

  const handleChange = (event) => {
    setSelectedOption(event.target.value);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      toggleVisibility();
      enterdata();
    }
  };
 const handleApiResponse = (data) => {
    // 1. Check if the API returned its specific error object
    if (data && data.error) {
      console.error("API returned a controlled error:", data.error);
      // IMPORTANT: We do nothing to the state, preserving the existing data.
      return;
    }

    // 2. Check for the expected successful response (an array)
    if (Array.isArray(data)) {
      setitemdata(data);
      return;
    }

    // 3. Handle unexpected but successful responses that are not errors or arrays.
    // This is a defensive fallback to prevent crashes.
    console.warn(
      "API response was in an unexpected format. Setting data to empty array. Received:",
      data
    );
    setitemdata([]);
  };
  function enterdata() {
    const scrapeData = async () => {
      const link = inputValue;
      await fetch("/api/scrape", {
        method: "POST",
        body: JSON.stringify({ link }),
      })
        .then((res) => res.json())
        .then(handleApiResponse)
        .catch((error) => {
          // CHANGE: Don't update state on error, just log it.
          console.error(`Error scraping new item:`, error);
        });
    };
    scrapeData();
  }

  const fetchdata = async () => {
    await fetch("/api/data", {
      method: "POST",
      body: JSON.stringify({ selectedOption }),
    })
      .then((res) => res.json())
      .then((data) => {
        // Still important: ensures we set an array, not null, on success
        setitemdata(data || []);
      })
      .catch((error) => {
        // CHANGE: Don't update state on error, just log it.
        console.error(`Error fetching sorted data:`, error);
      });
  };

  const fetchupdateddata = async () => {
    await fetch("/api/updatedata", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        // Still important: ensures we set an array, not null, on success
        setitemdata(data || []);
      })
      .catch((error) => {
        // CHANGE: Don't update state on error, just log it.
        console.error(`Error fetching updated data:`, error);
      });
  };

  useEffect(() => {
    fetchdata();
  }, [selectedOption]);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
    if (!isVisible) {
      setInputValue("");
    }
  };

  return (
    <div className="container">
      <Header
        itemdata={itemdata}
        setitemdata={setitemdata}
        selectedOption={selectedOption}
      />
      {isVisible ? (
        <>
          <div className="item-list">
            <div className="info">
              {/* ... (rest of your info div JSX is fine) */}
              <div className="info-div">
                <p className="margin font-we">{itemdata.length} items found</p>
                <button
                  className="item-color margin"
                  onClick={fetchupdateddata}
                >
                  <Image
                    alt="reload"
                    src="/reload.png"
                    height={15}
                    width={15}
                  />
                </button>
              </div>
              <div className="info-div">
                <p className="margin font-we">Sort By</p>
                <select
                  className="item-color margin length"
                  value={selectedOption}
                  onChange={handleChange}
                >
                  <option value="Relevance">Relevance</option>
                  <option value="Price (Highest first)">
                    Price (Highest first)
                  </option>
                  <option value="Price (Lowest first)">
                    Price (Lowest first)
                  </option>
                  <option value="Date (Highest first)">
                    Date (Highest first)
                  </option>
                  <option value="Date (Lowest first)">
                    Date (Lowest first)
                  </option>
                </select>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  className="item-color info-div font-we "
                  onClick={toggleVisibility}
                >
                  Add{" "}
                  <Image
                    alt="+"
                    className="marginl"
                    src="/add.png"
                    height={15}
                    width={15}
                  />
                </motion.button>
              </div>
            </div>
            <AnimatePresence>
              {itemdata.map((item) => (
                <motion.div
                  key={item.transid}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ItemCard
                    item={item}
                    setitemdata={setitemdata}
                    selectedOption={selectedOption}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="insertdata">
          <div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter URL"
            />
            <motion.button
              whileHover={{ scale: 1.1 }}
              transition={{ type: "spring", stiffness: 200, damping: 10 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleVisibility}
            >
              <Image alt="cross" src="/close.png" width="20" height="20" />
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}