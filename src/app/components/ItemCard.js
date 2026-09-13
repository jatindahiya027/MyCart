"use client";
import React, { Suspense } from "react";
import Image from "next/image";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { AnimatePresence, motion } from "motion/react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  RefreshCw,
  LineChart,
  Trash2,
  Loader2,
  Check,
  BadgeCheck,
  TrendingDown,
  TrendingUp,
  Eraser,
} from "lucide-react";

export const description = "A linear area chart";

const chartConfig = {
  price: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
};

const ItemCard = ({
  item,
  setitemdata,
  selectedOption,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onRefreshStatus,
}) => {
  const [data, setData] = useState([]);
  const [graph, setGraph] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const hasSameHighLowPrice =
    Number(item.max_price) === Number(item.min_price);
  const isCurrentHighPrice =
    !hasSameHighLowPrice && Number(item.current_price) === Number(item.max_price);

  const fetchdata = async (index) => {
    await fetch("/api/deleterecord", {
      method: "POST",
      body: JSON.stringify({ selectedOption, index }),
    })
      .then((res) => res.json())
      .then((data) => setitemdata(data))
      .catch((error) => {
        console.error("Error fetching data from db:", error);
      });
  };

  const fetchgraphdata = async (index) => {
    await fetch("/api/graphdata", {
      method: "POST",
      body: JSON.stringify({ index }),
    })
      .then((res) => res.json())
      .then((data) => setData(data))
      .catch((error) => {
        console.error("Error fetching graph data:", error);
      });
  };

  const handleDelete = (index) => {
    fetchdata(index);
  };

  const handleScrape = async () => {
    const refreshJob = {
      id: `refresh-product-${item.transid}-${Date.now()}`,
      label: `${item.website} · ${item.name}`,
    };
    onRefreshStatus?.({
      ...refreshJob,
      status: "processing",
      detail: "Searching for the current price…",
    });
    setIsScraping(true);
    try {
      const res = await fetch("/api/scrapeitem", {
        method: "POST",
        body: JSON.stringify({ transid: item.transid, link: item.link, selectedOption }),
      });
      const result = await res.json();
      if (!res.ok || !Array.isArray(result)) {
        throw new Error(result?.error || "No current price data was returned.");
      }
      setitemdata(result);
      onRefreshStatus?.({
        ...refreshJob,
        status: "processed",
        detail: "Current price data found",
      });
    } catch (err) {
      console.error("Error refreshing item price:", err);
      onRefreshStatus?.({
        ...refreshJob,
        status: "error",
        detail: "No updated data was returned",
        error: err?.message || "The current price could not be found.",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleClearHistory = async () => {
    const confirmed = window.confirm(
      `Clear older price history for “${item.name}”? The latest price will be kept.`
    );
    if (!confirmed) return;

    setIsClearingHistory(true);
    try {
      const response = await fetch("/api/history/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [item.transid], selectedOption }),
      });
      const result = await response.json();
      if (!response.ok || result?.error) {
        throw new Error(result?.error || "Could not clear price history.");
      }
      setitemdata(result.items || []);
      if (graph) await fetchgraphdata(item.transid);
    } catch (error) {
      console.error("Error clearing item price history:", error);
    } finally {
      setIsClearingHistory(false);
    }
  };

  const toggleVisibility = (index) => {
    if (!graph) {
      fetchgraphdata(index);
    }
    setGraph(!graph);
  };

  return (
    <>
      <div
        className={`item-card${isSelected ? " item-card--selected" : ""}`}
        onClick={isSelectMode ? () => onToggleSelect(item.transid) : undefined}
        style={isSelectMode ? { cursor: "pointer" } : undefined}
      >
        {/* Checkbox (select mode) */}
        {isSelectMode && (
          <div className="item-checkbox">
            <div className={`checkbox${isSelected ? " checkbox--checked" : ""}`}>
              {isSelected && (
                <Check size={10} color="white" strokeWidth={2.5} />
              )}
            </div>
          </div>
        )}

        {/* Image */}
        <div className="item-image">
          <motion.div
            className="item-image-frame"
            whileHover={{ scale: 1.06 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Image
              className="image fixsize"
              alt={item.name}
              src={item.image}
              fill
              sizes="(max-width: 600px) 68px, 96px"
            />
          </motion.div>
        </div>

        {/* Info */}
        <div className="item-info">
          <p className="brand">{item.website}</p>
          <a href={item.link} target="_blank" rel="noopener noreferrer">
            <motion.h2
              whileHover={{ x: 2 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="item-name"
              title={item.name}
            >
              {item.name}
            </motion.h2>
          </a>

          <p className="current-price">₹{item.current_price}</p>

          <div className="price-range">
            <span className="high-price">↑ ₹{item.max_price}</span>
            <span className="low-price">↓ ₹{item.min_price}</span>
          </div>

          {(hasSameHighLowPrice || item.is_lowest_price || item.is_price_drop || isCurrentHighPrice) && (
            <div className="price-badges" aria-label="Price indicators">
              {hasSameHighLowPrice ? (
                <span className="price-badge price-badge--same" title="Highest and lowest recorded prices are the same">
                  <BadgeCheck size={11} strokeWidth={2.4} />
                  Same
                </span>
              ) : item.is_lowest_price && (
                <span className="price-badge price-badge--lowest" title="Current price is the lowest recorded price">
                  <BadgeCheck size={11} strokeWidth={2.4} />
                  Lowest
                </span>
              )}
              {item.is_price_drop && (
                <span className="price-badge price-badge--drop" title="Current price is lower than the previous price">
                  <TrendingDown size={11} strokeWidth={2.4} />
                  Dropped
                </span>
              )}
              {isCurrentHighPrice && (
                <span className="price-badge price-badge--high" title="Current price is the highest recorded price">
                  <TrendingUp size={11} strokeWidth={2.4} />
                  High
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="item-actions">
          <span className="item-date">{item.current_price_date}</span>
          {!isSelectMode && (
            <div className="action-btns">
              {/* Per-item scrape */}
              <motion.button
                className={`scrape-btn${isScraping ? " scrape-btn--loading" : ""}`}
                onClick={(e) => { e.stopPropagation(); handleScrape(); }}
                whileTap={{ scale: 0.88 }}
                disabled={isScraping}
                title="Refresh this item's price"
              >
                {isScraping ? (
                  <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                ) : (
                  <RefreshCw size={13} />
                )}
              </motion.button>

              {/* Chart toggle */}
              <motion.button
                className={`chart-btn${graph ? " active" : ""}`}
                onClick={() => toggleVisibility(item.transid)}
                whileTap={{ scale: 0.88 }}
                title={graph ? "Hide chart" : "Show price history"}
              >
                <LineChart size={14} />
              </motion.button>

              <motion.button
                className="history-clear-btn"
                onClick={handleClearHistory}
                whileTap={{ scale: 0.88 }}
                disabled={isClearingHistory}
                title="Clear older price history"
              >
                {isClearingHistory ? (
                  <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                ) : (
                  <Eraser size={13} />
                )}
              </motion.button>

              {/* Delete */}
              <motion.button
                className="delete-btn"
                onClick={() => handleDelete(item.transid)}
                whileTap={{ scale: 0.88 }}
                title="Remove item"
              >
                <Trash2 size={13} />
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Price chart */}
      <AnimatePresence>
        {graph && !isSelectMode && (
          <motion.div
            initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{ transformOrigin: "top" }}
          >
            <Card className="chartbg">
              <CardContent className="chart-card-content">
                <ChartContainer config={chartConfig} className="areachartsize">
                  <AreaChart
                    accessibilityLayer
                    data={data}
                    margin={{ left: 2, right: 8, top: 8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id={`priceFill-${item.transid}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-price)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-price)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={(value) => value}
                          formatter={(value) => (
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              ₹{Number(value).toLocaleString("en-IN")}
                            </span>
                          )}
                        />
                      }
                    />
                    <Area
                      dataKey="price"
                      name="price"
                      type="monotone"
                      fill={`url(#priceFill-${item.transid})`}
                      stroke="var(--color-price)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ItemCard;
