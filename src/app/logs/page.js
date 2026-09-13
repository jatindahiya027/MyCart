"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import Header from "../components/Header";

const sourceLabels = {
  "manual-all": "Manual refresh",
  "manual-selected": "Selected refresh",
  "manual-single": "Single refresh",
  "add-product": "Add product",
  cron: "Scheduled refresh",
  email: "Email alert",
  scheduler: "Scheduler",
};

function formatDate(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/logs?limit=200", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Could not load scrape logs.");
      }
      setLogs(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="container">
      <Header />
      <main className="app-page logs-page">
        <div className="page-heading">
          <div>
            <h1>Scrape logs</h1>
            <p>Recent failures with the product details available at the time.</p>
          </div>
          <button className="secondary-action-btn" onClick={loadLogs} disabled={isLoading}>
            {isLoading ? <Loader2 size={14} className="spinning-icon" /> : <RefreshCw size={14} />}
            Refresh logs
          </button>
        </div>

        {error ? (
          <div className="page-error" role="alert">
            <AlertCircle size={17} />
            {error}
          </div>
        ) : isLoading ? (
          <div className="page-loading" role="status">
            <Loader2 size={18} className="spinning-icon" />
            Loading logs
          </div>
        ) : logs.length === 0 ? (
          <div className="logs-empty">
            <AlertCircle size={22} />
            <h2>No scrape errors recorded</h2>
            <p>Future add, refresh, cron, scheduler, and email failures will appear here.</p>
          </div>
        ) : (
          <div className="logs-list">
            {logs.map((log) => (
              <article className="log-entry" key={log.id}>
                <div className="log-product-image" aria-hidden={!log.product_image_url}>
                  {log.product_image_url ? (
                    <Image
                      src={log.product_image_url}
                      alt=""
                      width={72}
                      height={82}
                    />
                  ) : (
                    <AlertCircle size={20} />
                  )}
                </div>

                <div className="log-entry-content">
                  <div className="log-entry-heading">
                    <div>
                      <span className="log-source">{sourceLabels[log.source] || log.source}</span>
                      <h2>{log.product_name || "Product details unavailable"}</h2>
                    </div>
                    <time dateTime={log.occurred_at}>{formatDate(log.occurred_at)}</time>
                  </div>

                  <p className="log-error-message">{log.error_message}</p>

                  <dl className="log-metadata">
                    <div><dt>Product ID</dt><dd>{log.product_id || "Not assigned"}</dd></div>
                    <div><dt>Website</dt><dd>{log.website || "Unknown"}</dd></div>
                    <div><dt>Last price</dt><dd>{log.current_price != null ? `₹${Number(log.current_price).toLocaleString("en-IN")}` : "Unavailable"}</dd></div>
                    <div><dt>Run ID</dt><dd>{log.run_id || "Not assigned"}</dd></div>
                  </dl>

                  <div className="log-entry-footer">
                    {log.product_url && (
                      <a href={log.product_url} target="_blank" rel="noopener noreferrer">
                        Open product <ExternalLink size={12} />
                      </a>
                    )}
                    {log.error_details && log.error_details !== log.error_message && (
                      <details>
                        <summary>Technical details</summary>
                        <pre>{log.error_details}</pre>
                      </details>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
