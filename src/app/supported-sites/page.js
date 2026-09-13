import Header from "../components/Header";
import SupportedSitesDirectory from "../components/SupportedSitesDirectory";
import { SUPPORTED_STORES } from "../lib/supportedSites";

export const metadata = {
  title: "Supported websites | MyCart",
  description: "Browse every online store supported by MyCart.",
};

export default function SupportedSitesPage() {
  return (
    <div className="container">
      <Header />
      <main className="supported-sites-page">
        <SupportedSitesDirectory stores={SUPPORTED_STORES} />
      </main>
    </div>
  );
}
