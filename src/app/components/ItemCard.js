"use client";
import React, { Suspense } from "react";
import Image from "next/image";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { AnimatePresence, motion } from "motion/react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export const description = "A linear area chart";

const chartConfig = {
  desktop: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
};

const ItemCard = ({ item, setitemdata, selectedOption }) => {
  const [data, setData] = useState([]);
  const [graph, setGraph] = useState(false);

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
        console.error("Error fetching data from db:", error);
      });
  };

  const handleDelete = (index) => {
    fetchdata(index);
  };

  const toggleVisibility = (index) => {
    if (!graph) {
      fetchgraphdata(index);
    }
    setGraph(!graph);
  };

  return (
    <>
      <div className="item-card">
        {/* Image */}
        <div className="item-image">
          <motion.div
            whileHover={{ scale: 1.06 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Image
              className="image fixsize"
              alt={item.name}
              src={item.image}
              height={110}
              width={96}
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
        </div>

        {/* Actions */}
        <div className="item-actions">
          <span className="item-date">{item.current_price_date}</span>
          <div className="action-btns">
            {/* Chart toggle */}
            <motion.button
              className={`chart-btn${graph ? " active" : ""}`}
              onClick={() => toggleVisibility(item.transid)}
              whileTap={{ scale: 0.88 }}
              title={graph ? "Hide chart" : "Show price history"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </motion.button>

            {/* Delete */}
            <motion.button
              className="delete-btn"
              onClick={() => handleDelete(item.transid)}
              whileTap={{ scale: 0.88 }}
              title="Remove item"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Price chart */}
      <AnimatePresence>
        {graph && (
          <motion.div
            initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{ transformOrigin: "top" }}
          >
            <Card className="chartbg">
              <CardHeader style={{ padding: "8px 16px 0" }} />
              <CardContent style={{ padding: "0 16px 12px" }}>
                <ChartContainer config={chartConfig} className="areachartsize">
                  <AreaChart
                    accessibilityLayer
                    data={data}
                    margin={{ left: 0, right: 0 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent indicator="line" />}
                    />
                    <Area
                      dataKey="price"
                      type="linear"
                      fill="var(--color-desktop)"
                      fillOpacity={0.3}
                      stroke="var(--color-desktop)"
                      strokeWidth={2}
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
