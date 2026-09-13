"use client";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import Header from "./components/Header";
import ItemCard from "./components/ItemCard";
import {
  extractProductUrls,
  mapWithConcurrency,
  productUrlLabel,
} from "./lib/addProducts";
import {
  findSupportedStore,
  unsupportedStoreMessage,
} from "./lib/supportedSites";
import { filterProducts } from "./lib/productSearch";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Plus, LayoutList, Trash2, X, Link2, ArrowRight, Loader2, Square, Eraser } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const [allItemData, setAllItemData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUrlBar, setShowUrlBar] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedOption, setSelectedOption] = useState("Relevance");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [addJobs, setAddJobs] = useState([]);
  const [refreshJobs, setRefreshJobs] = useState([]);
  const [inputError, setInputError] = useState("");
  const [updateProgress, setUpdateProgress] = useState(null);
  const [isStoppingUpdate, setIsStoppingUpdate] = useState(false);
  const urlInputRef = useRef(null);
  const activeBulkRefreshRef = useRef(null);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [isBulkClearingHistory, setIsBulkClearingHistory] = useState(false);
  const itemdata = useMemo(
    () => filterProducts(allItemData, searchQuery),
    [allItemData, searchQuery]
  );
  const backgroundUpdateJob = useMemo(() => {
    const isActive =
      updateProgress?.status === "running" ||
      updateProgress?.status === "cancel_requested";
    if (!isActive || activeBulkRefreshRef.current) return null;

    const currentProduct = allItemData.find(
      (item) => item.link === updateProgress.current_item
    );
    const sourceLabel = updateProgress.source === "cron"
      ? "Scheduled refresh"
      : "Manual refresh";
    return {
      id: `background-refresh-${updateProgress.id}`,
      kind: "refresh",
      label: currentProduct
        ? `${currentProduct.website} · ${currentProduct.name}`
        : updateProgress.current_item
        ? productUrlLabel(updateProgress.current_item)
        : sourceLabel,
      status: "processing",
      detail: updateProgress.status === "cancel_requested"
        ? "Stopping refresh…"
        : `${updateProgress.processed}/${updateProgress.total} checked · ${updateProgress.success} found · ${updateProgress.failure} not found`,
      canStop: true,
    };
  }, [allItemData, updateProgress]);
  const activityJobs = useMemo(
    () => [
      ...addJobs.map((job) => ({ ...job, kind: "add" })),
      ...refreshJobs,
      ...(backgroundUpdateJob ? [backgroundUpdateJob] : []),
    ],
    [addJobs, backgroundUpdateJob, refreshJobs]
  );

  const handleChange = (event) => {
    setSelectedOption(event.target.value);
  };

  const removeRefreshJob = useCallback((jobId) => {
    setRefreshJobs((current) => current.filter((job) => job.id !== jobId));
  }, []);

  const handleItemRefreshStatus = useCallback((job) => {
    setRefreshJobs((current) => [
      ...current.filter((entry) => entry.id !== job.id),
      { ...job, kind: "refresh" },
    ]);
    if (job.status === "processed") {
      window.setTimeout(() => removeRefreshJob(job.id), 1600);
    }
  }, [removeRefreshJob]);

  async function enterdata() {
    const links = extractProductUrls(inputValue);
    if (isScraping) return;
    if (!links.length) {
      setInputError("Enter a complete http(s) product URL.");
      return;
    }

    const jobs = links.map((url, index) => {
      const store = findSupportedStore(url);
      return {
        id: `${Date.now()}-${index}`,
        url,
        label: productUrlLabel(url),
        store,
        status: store ? "processing" : "error",
        error: store ? null : unsupportedStoreMessage(url),
      };
    });
    const processableJobs = jobs.filter((job) => job.store);
    const unsupportedJobs = jobs.filter((job) => !job.store);
    setAddJobs((current) => [...current, ...jobs]);
    unsupportedJobs.forEach((job) => {
      window.setTimeout(() => {
        setAddJobs((current) => current.filter((entry) => entry.id !== job.id));
      }, 1000);
    });
    setIsScraping(processableJobs.length > 0);
    setInputError("");
    setInputValue("");
    setShowUrlBar(false);

    await mapWithConcurrency(processableJobs, 3, async (job) => {
      try {
        const response = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: job.url, details: true }),
        });
        const data = await response.json();
        if (!response.ok || data?.error) {
          throw new Error(data?.error || `Request failed with HTTP ${response.status}.`);
        }

        setAddJobs((current) =>
          current.map((entry) =>
            entry.id === job.id
              ? {
                  ...entry,
                  status: "processed",
                  label: data.product?.website || entry.label,
                  product: data.product,
                }
              : entry
          )
        );
        window.setTimeout(() => {
          setAddJobs((current) => current.filter((entry) => entry.id !== job.id));
        }, 1400);
      } catch (error) {
        setAddJobs((current) =>
          current.map((entry) =>
            entry.id === job.id
              ? {
                  ...entry,
                  status: "error",
                  error: error?.message || "Could not add this product.",
                }
              : entry
          )
        );
      }
    });

    if (processableJobs.length > 0) await fetchdata();
    setIsScraping(false);
  }

  const fetchdata = useCallback(async () => {
    await fetch("/api/data", {
      method: "POST",
      body: JSON.stringify({ selectedOption }),
    })
      .then((res) => res.json())
      .then((data) => setAllItemData(data || []))
      .catch((error) => {
        console.error("Error fetching sorted data:", error);
      });
  }, [selectedOption]);

  const fetchUpdateProgress = async () => {
    try {
      const response = await fetch("/api/updateprogress");
      const data = await response.json();
      setUpdateProgress(data);
      return data;
    } catch (error) {
      console.error("Error fetching update progress:", error);
      return null;
    }
  };

  const fetchupdateddata = async (ids = null) => {
    if (isUpdateRunning) return;
    const requestedIds = Array.isArray(ids) ? ids : null;
    const targetItems = requestedIds
      ? allItemData.filter((item) => requestedIds.includes(item.transid))
      : allItemData;
    const jobId = `refresh-${Date.now()}`;
    const jobLabel = requestedIds
      ? `${targetItems.length} selected product${targetItems.length === 1 ? "" : "s"}`
      : `All ${targetItems.length} tracked product${targetItems.length === 1 ? "" : "s"}`;
    activeBulkRefreshRef.current = { id: jobId, label: jobLabel };
    setRefreshJobs((current) => [
      ...current,
      {
        id: jobId,
        kind: "refresh",
        label: jobLabel,
        status: "processing",
        detail: "Starting price search…",
        canStop: true,
      },
    ]);
    setUpdateProgress(null);
    setIsRefreshing(true);
    try {
      const options = { method: "POST" };
      if (requestedIds) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({ ids: requestedIds });
      }
      const response = await fetch("/api/updatedata", options);
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "The price refresh failed.");
      }
      setAllItemData(Array.isArray(data) ? data : []);
      const finalProgress = (await fetchUpdateProgress()) || {
        status: "completed",
        total: targetItems.length,
        processed: targetItems.length,
        success: targetItems.length,
        failure: 0,
      };
      const succeeded = Number(finalProgress.success || 0);
      const failed = Number(finalProgress.failure || 0);
      const wasStopped = finalProgress.status === "canceled";
      const hasErrors = failed > 0 || finalProgress.status === "failed" || wasStopped;
      setRefreshJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: hasErrors ? "error" : "processed",
                canStop: false,
                detail: wasStopped
                  ? `Stopped after ${finalProgress.processed || 0} checked · ${succeeded} found`
                  : hasErrors
                  ? `${succeeded} found · ${failed} could not be fetched`
                  : targetItems.length
                  ? `${succeeded} price${succeeded === 1 ? "" : "s"} found`
                  : "No tracked products to refresh",
                error: hasErrors
                  ? finalProgress.error || "Some current prices could not be found. Check Logs for details."
                  : null,
              }
            : job
        )
      );
      activeBulkRefreshRef.current = null;
      if (!hasErrors) window.setTimeout(() => removeRefreshJob(jobId), 1600);
      return true;
    } catch (error) {
      console.error("Error fetching updated data:", error);
      setRefreshJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "error",
                canStop: false,
                error: error?.message || "The price refresh failed.",
                detail: "No updated data was returned",
              }
            : job
        )
      );
      activeBulkRefreshRef.current = null;
      return false;
    } finally {
      setIsRefreshing(false);
    }
  };

  const stopUpdate = async () => {
    setIsStoppingUpdate(true);
    await fetch("/api/updateprogress/stop", { method: "POST" })
      .then((res) => res.json())
      .then((data) => setUpdateProgress(data))
      .catch((error) => {
        console.error("Error stopping update:", error);
      })
      .finally(() => setIsStoppingUpdate(false));
  };

  useEffect(() => {
    fetchdata();
  }, [fetchdata]);

  useEffect(() => {
    const refreshProducts = () => fetchdata();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshProducts();
    };

    window.addEventListener("mycart:product-added", refreshProducts);
    window.addEventListener("focus", refreshProducts);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("mycart:product-added", refreshProducts);
      window.removeEventListener("focus", refreshProducts);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchdata]);

  useEffect(() => {
    fetchUpdateProgress();
  }, []);

  useEffect(() => {
    const activeStatus =
      updateProgress?.status === "running" ||
      updateProgress?.status === "cancel_requested";
    if (!activeStatus && !isRefreshing) return;

    const interval = setInterval(fetchUpdateProgress, 1500);
    return () => clearInterval(interval);
  }, [updateProgress?.status, isRefreshing]);

  useEffect(() => {
    const activeJob = activeBulkRefreshRef.current;
    if (!activeJob || updateProgress?.status !== "running") return;
    if (!String(updateProgress.source || "").startsWith("manual-")) return;

    const currentProduct = allItemData.find(
      (item) => item.link === updateProgress.current_item
    );
    const currentLabel = currentProduct
      ? `${currentProduct.website} · ${currentProduct.name}`
      : updateProgress.current_item
      ? productUrlLabel(updateProgress.current_item)
      : activeJob.label;
    setRefreshJobs((current) =>
      current.map((job) =>
        job.id === activeJob.id
          ? {
              ...job,
              label: currentLabel,
              detail: `${updateProgress.processed}/${updateProgress.total} checked · ${updateProgress.success} found · ${updateProgress.failure} not found`,
            }
          : job
      )
    );
  }, [allItemData, updateProgress]);

  useEffect(() => {
    if (showUrlBar && urlInputRef.current) {
      setTimeout(() => urlInputRef.current?.focus(), 50);
    }
  }, [showUrlBar]);

  useEffect(() => {
    const handlePaste = (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea") || target.isContentEditable)
      ) {
        return;
      }
      const urls = extractProductUrls(event.clipboardData?.getData("text"));
      if (!urls.length) return;
      event.preventDefault();
      setShowUrlBar(true);
      setInputValue(urls.join("\n"));
      setInputError("");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enterdata();
    }
    if (e.key === "Escape") {
      setShowUrlBar(false);
      setInputValue("");
      setInputError("");
    }
  };

  const openUrlBar = () => {
    setShowUrlBar(true);
    setInputError("");
  };
  const dismissUrlBar = () => {
    setShowUrlBar(false);
    setInputValue("");
    setInputError("");
  };

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
      if (Array.isArray(data)) setAllItemData(data);
    } catch (err) {
      console.error("Bulk delete error:", err);
    } finally {
      setIsBulkDeleting(false);
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  };

  const handleBulkRefresh = async () => {
    if (!selectedIds.size || isUpdateRunning) return;
    setIsBulkRefreshing(true);
    const refreshed = await fetchupdateddata(Array.from(selectedIds));
    setIsBulkRefreshing(false);
    if (refreshed) {
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  };

  const handleBulkClearHistory = async () => {
    if (!selectedIds.size) return;
    const productCount = selectedIds.size;
    const confirmed = window.confirm(
      `Clear older price history for ${productCount} selected product${productCount === 1 ? "" : "s"}? The latest price will be kept.`
    );
    if (!confirmed) return;

    setIsBulkClearingHistory(true);
    try {
      const response = await fetch("/api/history/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          selectedOption,
        }),
      });
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Could not clear price history.");
      }
      setAllItemData(data.items || []);
      setSelectedIds(new Set());
      setIsSelectMode(false);
    } catch (error) {
      console.error("Bulk history clear error:", error);
    } finally {
      setIsBulkClearingHistory(false);
    }
  };

  const allSelected = itemdata.length > 0 && selectedIds.size === itemdata.length;
  const isUpdateRunning =
    updateProgress?.status === "running" ||
    updateProgress?.status === "cancel_requested" ||
    isRefreshing;
  return (
    <div className="container">
      <Header
        query={searchQuery}
        onQueryChange={setSearchQuery}
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
                <motion.button
                  className="cancel-select-btn"
                  onClick={toggleSelectMode}
                  whileTap={{ scale: 0.96 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  className={`bulk-refresh-btn${selectedIds.size === 0 ? " bulk-action-btn--disabled" : ""}`}
                  onClick={handleBulkRefresh}
                  disabled={selectedIds.size === 0 || isBulkRefreshing || isUpdateRunning}
                  whileTap={{ scale: 0.96 }}
                >
                  {isBulkRefreshing ? (
                    <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Refresh{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                </motion.button>
                <motion.button
                  className={`bulk-history-btn${selectedIds.size === 0 ? " bulk-action-btn--disabled" : ""}`}
                  onClick={handleBulkClearHistory}
                  disabled={selectedIds.size === 0 || isBulkClearingHistory}
                  whileTap={{ scale: 0.96 }}
                >
                  {isBulkClearingHistory ? (
                    <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                  ) : (
                    <Eraser size={13} />
                  )}
                  Clear history
                </motion.button>
                <motion.button
                  className={`bulk-delete-btn${selectedIds.size === 0 ? " bulk-delete-btn--disabled" : ""}`}
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || isBulkDeleting}
                  whileTap={{ scale: 0.96 }}
                >
                  {isBulkDeleting ? (
                    <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                  ) : (
                    <Trash2 size={13} />
                  )}
                  Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  className="icon-btn"
                  onClick={toggleSelectMode}
                  whileTap={{ scale: 0.9 }}
                  title="Select items"
                >
                  <LayoutList size={15} />
                </motion.button>

                <motion.button
                  className={`icon-btn${isRefreshing ? " spinning" : ""}`}
                  onClick={() => fetchupdateddata()}
                  disabled={isUpdateRunning}
                  whileTap={{ scale: 0.9 }}
                  title={isUpdateRunning ? "Update already running" : "Refresh prices"}
                >
                  <RefreshCw size={15} />
                </motion.button>

                <motion.button
                  className="add-btn"
                  onClick={openUrlBar}
                  whileTap={{ scale: 0.96 }}
                >
                  <Plus size={14} />
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
              <div>
                <div className={`url-input-bar${inputError ? " url-input-bar--error" : ""}`}>
                  <Link2 size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <textarea
                    ref={urlInputRef}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setInputError("");
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Paste one or more product URLs and press Enter…"
                    rows={1}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={Boolean(inputError)}
                    aria-describedby={inputError ? "url-input-error" : undefined}
                  />
                  <button
                    className="url-submit-btn"
                    onClick={enterdata}
                    disabled={!inputValue.trim() || isScraping}
                    title="Add item"
                  >
                    {isScraping ? (
                      <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                    ) : (
                      <ArrowRight size={13} />
                    )}
                  </button>
                  <button className="url-dismiss-btn" onClick={dismissUrlBar} title="Cancel">
                    <X size={13} />
                  </button>
                </div>
                {inputError && (
                  <div className="url-input-error" id="url-input-error" role="alert">
                    <span>{inputError}</span>
                    <Link href="/supported-sites">View supported websites</Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activityJobs.length > 0 && (
            <motion.section
              className="add-progress"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              aria-live="polite"
              aria-label="Product activity"
            >
              <div className="add-progress-title">Activity</div>
              <div className="add-progress-list">
                {activityJobs.map((job) => (
                  <div className={`add-progress-row add-progress-row--${job.status}`} key={job.id}>
                    <div className="add-progress-copy">
                      <span className="add-progress-site">{job.label}</span>
                      {job.detail && (
                        <span className="add-progress-detail">{job.detail}</span>
                      )}
                      {job.status === "error" && (
                        <span className="add-progress-error">
                          {job.kind === "refresh" ? "Could not refresh" : "Could not add"}: {job.error}
                        </span>
                      )}
                    </div>
                    <span className="add-progress-status">
                      {job.status === "processing" && <Loader2 size={12} />}
                      {job.status === "processing"
                        ? job.kind === "refresh" ? "Searching" : "Processing"
                        : job.status === "processed"
                        ? job.kind === "refresh" ? "Found" : "Processed"
                        : job.kind === "refresh" ? "Not found" : "Error"}
                    </span>
                    {job.kind === "refresh" && job.canStop && (
                      <button
                        className="add-progress-dismiss activity-stop-btn"
                        onClick={stopUpdate}
                        disabled={isStoppingUpdate}
                        aria-label="Stop price refresh"
                      >
                        {isStoppingUpdate ? <Loader2 size={12} /> : <Square size={10} fill="currentColor" />}
                      </button>
                    )}
                    {job.status === "error" && (
                      <button
                        className="add-progress-dismiss"
                        onClick={() => {
                          if (job.kind === "refresh") removeRefreshJob(job.id);
                          else setAddJobs((current) => current.filter((entry) => entry.id !== job.id));
                        }}
                        aria-label={`Dismiss ${job.label} error`}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.section>
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
              <h3>{searchQuery ? "No matching products" : "Your cart is empty"}</h3>
              <p>{searchQuery ? "Try a different search" : "Add a product URL to start tracking prices"}</p>
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
                  setitemdata={setAllItemData}
                  selectedOption={selectedOption}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.has(item.transid)}
                  onToggleSelect={handleToggleSelect}
                  onRefreshStatus={handleItemRefreshStatus}
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
