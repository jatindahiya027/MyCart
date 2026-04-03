"use client";
import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Header from "./components/Header";
import ItemCard from "./components/ItemCard";
import { AnimatePresence, motion } from "framer-motion";

export default function Home() {
  const [itemdata, setitemdata] = useState([]);
  const [showUrlBar, setShowUrlBar] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedOption, setSelectedOption] = useState("Relevance");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const urlInputRef = useRef(null);

  // Bulk select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const handleChange = (event) => {
    setSelectedOption(event.target.value);
  };

  const handleApiResponse = (data) => {
    if (data && data.error) {
      console.error("API returned a controlled error:", data.error);
      return;
    }
    if (Array.isArray(data)) {
      setitemdata(data);
      return;
    }
    console.warn("Unexpected API response format:", data);
    setitemdata([]);
  };

  function enterdata() {
    if (!inputValue.trim()) return;
    const scrapeData = async () => {
      setIsScraping(true);
      const link = inputValue;
      await fetch("/api/scrape", {
        method: "POST",
        body: JSON.stringify({ link }),
      })
        .then((res) => res.json())
        .then(handleApiResponse)
        .catch((error) => {
          console.error("Error scraping new item:", error);
        })
        .finally(() => {
          setIsScraping(false);
        });
    };
    scrapeData();
    setInputValue("");
    setShowUrlBar(false);
  }

  const fetchdata = async () => {
    await fetch("/api/data", {
      method: "POST",
      body: JSON.stringify({ selectedOption }),
    })
      .then((res) => res.json())
      .then((data) => setitemdata(data || []))
      .catch((error) => {
        console.error("Error fetching sorted data:", error);
      });
  };

  const fetchupdateddata = async () => {
    setIsRefreshing(true);
    await fetch("/api/updatedata", { method: "POST" })
      .then((res) => res.json())
      .then((data) => setitemdata(data || []))
      .catch((error) => {
        console.error("Error fetching updated data:", error);
      })
      .finally(() => setIsRefreshing(false));
  };

  useEffect(() => {
    fetchdata();
  }, [selectedOption]);

  useEffect(() => {
    if (showUrlBar && urlInputRef.current) {
      setTimeout(() => urlInputRef.current?.focus(), 50);
    }
  }, [showUrlBar]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") enterdata();
    if (e.key === "Escape") {
      setShowUrlBar(false);
      setInputValue("");
    }
  };

  const openUrlBar = () => setShowUrlBar(true);
  const dismissUrlBar = () => {
    setShowUrlBar(false);
    setInputValue("");
  };

  // Bulk select helpers
  const toggleSelectMode = () => {
    setIsSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === itemdata.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(itemdata.map((i) => i.transid)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const res = await fetch("/api/bulkdelete", {
        method: "POST",
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          selectedOption,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data)) setitemdata(data);
    } catch (err) {
      console.error("Bulk delete error:", err);
    } finally {
      setIsBulkDeleting(false);
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  };

  const allSelected = itemdata.length > 0 && selectedIds.size === itemdata.length;

  return (
    <div className="container">
      <Header
        itemdata={itemdata}
        setitemdata={setitemdata}
        selectedOption={selectedOption}
      />

      <div className="item-list">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-left">
            {isSelectMode ? (
              <>
                <button className="select-all-btn" onClick={handleSelectAll}>
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
                <span className="item-count">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : `${itemdata.length} items`}
                </span>
              </>
            ) : (
              <>
                <span className="item-count">{itemdata.length} items</span>
                <select
                  className="sort-select"
                  value={selectedOption}
                  onChange={handleChange}
                >
                  <option value="Relevance">Relevance</option>
                  <option value="Price (Highest first)">Price ↓</option>
                  <option value="Price (Lowest first)">Price ↑</option>
                  <option value="Date (Highest first)">Newest</option>
                  <option value="Date (Lowest first)">Oldest</option>
                </select>
              </>
            )}
          </div>

          <div className="toolbar-right">
            {isSelectMode ? (
              <>
                {/* Cancel */}
                <motion.button
                  className="cancel-select-btn"
                  onClick={toggleSelectMode}
                  whileTap={{ scale: 0.96 }}
                >
                  Cancel
                </motion.button>
                {/* Delete selected */}
                <motion.button
                  className={`bulk-delete-btn${selectedIds.size === 0 ? " bulk-delete-btn--disabled" : ""}`}
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || isBulkDeleting}
                  whileTap={{ scale: 0.96 }}
                >
                  {isBulkDeleting ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                      <circle cx="12" cy="12" r="9" strokeDasharray="28 56" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                    </svg>
                  )}
                  Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                </motion.button>
              </>
            ) : (
              <>
                {/* Select mode toggle */}
                <motion.button
                  className="icon-btn"
                  onClick={toggleSelectMode}
                  whileTap={{ scale: 0.9 }}
                  title="Select items"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="4" height="4" rx="1"/>
                    <path d="M10 7h11M10 12h11M10 17h11"/>
                    <rect x="3" y="10" width="4" height="4" rx="1"/>
                    <rect x="3" y="15" width="4" height="4" rx="1"/>
                  </svg>
                </motion.button>

                {/* Refresh */}
                <motion.button
                  className={`icon-btn${isRefreshing ? " spinning" : ""}`}
                  onClick={fetchupdateddata}
                  whileTap={{ scale: 0.9 }}
                  title="Refresh prices"
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.5 7.5a6 6 0 1 1-1.5-4"/>
                    <path d="M12 1v3.5H8.5"/>
                  </svg>
                </motion.button>

                {/* Add URL */}
                <motion.button
                  className="add-btn"
                  onClick={openUrlBar}
                  whileTap={{ scale: 0.96 }}
                >
                  <span className="add-btn-icon">+</span>
                  <span className="add-btn-label">Add URL</span>
                </motion.button>
              </>
            )}
          </div>
        </div>

        {/* Inline URL Input Bar */}
        <AnimatePresence>
          {showUrlBar && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 8 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="url-input-bar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                <input
                  ref={urlInputRef}
                  type="url"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Paste product URL and press Enter…"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button
                  className="url-submit-btn"
                  onClick={enterdata}
                  disabled={!inputValue.trim() || isScraping}
                  title="Add item"
                >
                  {isScraping ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{animation:"spin 0.8s linear infinite"}}>
                      <circle cx="12" cy="12" r="9" strokeDasharray="28 56" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  )}
                </button>
                <button className="url-dismiss-btn" onClick={dismissUrlBar} title="Cancel">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Item Cards */}
        <AnimatePresence>
          {itemdata.length === 0 ? (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <div className="empty-state-icon">🛍</div>
              <h3>Your cart is empty</h3>
              <p>Add a product URL to start tracking prices</p>
            </motion.div>
          ) : (
            itemdata.map((item) => (
              <motion.div
                key={item.transid}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.25 }}
              >
                <ItemCard
                  item={item}
                  setitemdata={setitemdata}
                  selectedOption={selectedOption}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.has(item.transid)}
                  onToggleSelect={handleToggleSelect}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
