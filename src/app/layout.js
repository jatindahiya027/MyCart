import "./cronjob"
import "./lib/database"
import { Rubik, Figtree, Fira_Code } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--rubik-font",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--figtree-font",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--fira-font",
  display: "swap",
});

export const metadata = {
  title: "MyCart",
  description: "Track prices of your products",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${rubik.variable} ${figtree.variable} ${firaCode.variable}`}>
      <body>{children}</body>
    </html>
  );
}
