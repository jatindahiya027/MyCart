"use client";
import React, { Suspense } from "react";
import Image from "next/image";
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { AnimatePresence, motion } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
export const description = "A linear area chart";
const chartData = [
  { month: "January", desktop: 186 },
  { month: "February", desktop: 305 },
  { month: "March", desktop: 237 },
  { month: "April", desktop: 73 },
  { month: "May", desktop: 209 },
  { month: "June", desktop: 214 },
];
const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "hsl(var(--chart-1))",
  },
};

const ItemCard = ({ item, setitemdata, selectedOption }) => {
  const [data, setData] = useState([]);
  const fetchdata = async (index) => {
    console.log(index);
    await fetch("/api/deleterecord", {
      method: "POST",
      body: JSON.stringify({ selectedOption, index }),
    })
      .then((res) => res.json())
      .then((data) => setitemdata(data))
      .catch((error) => {
        console.error(`Error fetching data from db:`, error);
      });
  };

  const fetchgraphdata = async (index) => {
    console.log(index);
    await fetch("/api/graphdata", {
      method: "POST",
      body: JSON.stringify({ index }),
    })
      .then((res) => res.json())
      .then((data) => setData(data))
      .catch((error) => {
        console.error(`Error fetching data from db:`, error);
      });
  };
  const handleDelete = (index) => {
    fetchdata(index);
  };
  const [graph, setGraph] = useState(false);
  const toggleVisibility = (index) => {
    if (!graph) {
      fetchgraphdata(index);
    }
    setGraph(!graph); // Toggle visibility
    // setInputValue(null);
  };
  return (
    <>
      <div className="item-card">
        <motion.div
          className="item-image"
          whileHover={{ scale: 1.15}}
          transition={{ type: "spring", stiffness: 200, damping: 10 }}
          
        >
          <Image
            className="image fixsize"
            alt={item.name}
            src={item.image}
            height={140}
            width={100}
          />
        </motion.div>

        <div className="item-info">
          <p className="brand">{item.website}</p>

          <a href={item.link}>
            <motion.h2
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 80, damping: 10 }}
              // whileTap={{ scale: 0.95 }}
              style={{ transformOrigin: "left center" }}
              className="item-name"
            >
              {item.name}
            </motion.h2>
          </a>
          <p className="price-range">
            <span className="high-price">High: ₹{item.max_price}</span>
            <span className="low-price">Low: ₹{item.min_price}</span>
          </p>
          <p className="discount">
            <motion.button 
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 1, type: "spring", stiffness: 100, damping: 10 }}
            onClick={() => toggleVisibility(item.transid)}>
              {graph ? (
                <Image alt="cross" src="/arrowup.png" width="15" height="15" />
              ) : (
                <Image
                  alt="cross"
                  src="/arrowdown.png"
                  width="15"
                  height="15"
                />
              )}
            </motion.button>
          </p>
          <p className="current-price">₹{item.current_price}</p>
        </div>
        <div className="item-footer">
          <p>{item.current_price_date}</p>
          <motion.button
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            className="delete-btn"
            onClick={() => handleDelete(item.transid)}
          >
            <Image alt="delete" src="/delete.png" width="18" height="18" />
          </motion.button>
        </div>
      </div>
      {graph ? (
        <motion.div
        initial={{ opacity: 0, y: 20 }} // Start hidden and slightly below
    animate={{ opacity: 1, y: 0 }} // Fade in and slide up
    exit={{ opacity: 0, y: 20 }} // Optional exit animation
    transition={{ duration: 0.8, ease: "easeInOut" }}
        ><Card className="chartbg">
          <CardHeader></CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="areachartsize">
              <AreaChart
                accessibilityLayer
                data={data}
                margin={{
                  left: 0,
                  right: 0,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  // tickFormatter={(value) => value.slice(0, 10)}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Area
                  dataKey="price"
                  type="linear"
                  fill="var(--color-desktop)"
                  fillOpacity={0.4}
                  stroke="var(--color-desktop)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card></motion.div>
      ) : null}
    </>
  );
};

export default ItemCard;
