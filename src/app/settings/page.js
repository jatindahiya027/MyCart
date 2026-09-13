"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Minus, Plus, Save, ShieldCheck } from "lucide-react";
import Header from "../components/Header";

const clampHours = (value) => Math.min(24, Math.max(1, Number(value) || 1));

export default function SettingsPage() {
  const [notificationEmail, setNotificationEmail] = useState("");
  const [gmailAppPassword, setGmailAppPassword] = useState("");
  const [cronIntervalHours, setCronIntervalHours] = useState(4);
  const [cronEnabled, setCronEnabled] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [passwordSource, setPasswordSource] = useState("none");
  const [clearPassword, setClearPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || data?.error) {
          throw new Error(data?.error || "Could not load settings.");
        }
        setNotificationEmail(data.notificationEmail || "");
        setCronIntervalHours(data.cronIntervalHours || 4);
        setCronEnabled(data.cronEnabled !== false);
        setHasPassword(Boolean(data.gmailAppPasswordConfigured));
        setPasswordSource(data.passwordSource || "none");
      } catch (error) {
        setNotice({ type: "error", message: error.message });
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const updateHours = (value) => {
    setCronIntervalHours(clampHours(value));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationEmail,
          gmailAppPassword,
          clearGmailAppPassword: clearPassword,
          cronIntervalHours,
          cronEnabled,
        }),
      });
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Could not save settings.");
      }
      setNotificationEmail(data.notificationEmail || "");
      setCronIntervalHours(data.cronIntervalHours);
      setCronEnabled(data.cronEnabled !== false);
      setHasPassword(Boolean(data.gmailAppPasswordConfigured));
      setPasswordSource(data.passwordSource || "none");
      setGmailAppPassword("");
      setClearPassword(false);
      setNotice({
        type: "success",
        message: data.cronEnabled
          ? "Settings saved. The cron schedule is active."
          : "Settings saved. Scheduled refresh is off.",
      });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container">
      <Header />
      <main className="app-page settings-page">
        <div className="page-heading">
          <div>
            <h1>Settings</h1>
            <p>Configure price-drop email and scheduled refresh frequency.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="page-loading" role="status">
            <Loader2 size={18} className="spinning-icon" />
            Loading settings
          </div>
        ) : (
          <form className="settings-form" onSubmit={handleSave}>
            <section className="settings-section" aria-labelledby="email-settings-title">
              <div className="settings-section-heading">
                <div>
                  <h2 id="email-settings-title">Email alerts</h2>
                  <p>MyCart sends price-drop alerts from this Gmail account to the same address.</p>
                </div>
                <span className="security-note">
                  <ShieldCheck size={14} />
                  Encrypted at rest
                </span>
              </div>

              <label className="field-label" htmlFor="notification-email">
                Gmail address
              </label>
              <input
                id="notification-email"
                className="settings-input"
                type="email"
                value={notificationEmail}
                onChange={(event) => setNotificationEmail(event.target.value)}
                placeholder="you@gmail.com"
                autoComplete="email"
              />

              <label className="field-label" htmlFor="gmail-app-password">
                Gmail app password
              </label>
              <div className="password-input-wrap">
                <input
                  id="gmail-app-password"
                  className="settings-input"
                  type={showPassword ? "text" : "password"}
                  value={gmailAppPassword}
                  onChange={(event) => {
                    setGmailAppPassword(event.target.value);
                    setClearPassword(false);
                  }}
                  placeholder={hasPassword ? "Leave blank to keep saved password" : "Enter Gmail app password"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide app password" : "Show app password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="field-help">
                Use a Google app password, not your normal Gmail password. The value is encrypted before SQLite storage and is never returned to the browser.
              </p>

              {hasPassword && passwordSource === "app" && (
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={clearPassword}
                    onChange={(event) => {
                      setClearPassword(event.target.checked);
                      if (event.target.checked) setGmailAppPassword("");
                    }}
                  />
                  Remove the saved app password
                </label>
              )}
              {hasPassword && passwordSource === "environment" && (
                <p className="settings-managed-note">
                  An app password is currently provided by <code>.env.local</code>. Enter a new one above to store an encrypted app-managed password instead.
                </p>
              )}
            </section>

            <section className="settings-section" aria-labelledby="schedule-settings-title">
              <div className="settings-section-heading">
                <div>
                  <h2 id="schedule-settings-title">Scheduled refresh</h2>
                  <p>Choose how often all tracked products are refreshed.</p>
                </div>
                <label className="schedule-toggle">
                  <span>{cronEnabled ? "On" : "Off"}</span>
                  <input
                    type="checkbox"
                    checked={cronEnabled}
                    onChange={(event) => setCronEnabled(event.target.checked)}
                    aria-label="Enable scheduled refresh"
                  />
                  <span className="schedule-toggle-track" aria-hidden="true">
                    <span />
                  </span>
                </label>
              </div>

              <div className={`schedule-controls${cronEnabled ? "" : " schedule-controls--disabled"}`}>
                <label className="field-label" htmlFor="cron-hours">
                  Run every
                </label>
                <div className="hour-counter">
                  <button
                    type="button"
                    onClick={() => updateHours(cronIntervalHours - 1)}
                    disabled={!cronEnabled || cronIntervalHours <= 1}
                    aria-label="Decrease refresh interval"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    id="cron-hours"
                    type="number"
                    min="1"
                    max="24"
                    step="1"
                    value={cronIntervalHours}
                    onChange={(event) => updateHours(event.target.value)}
                    disabled={!cronEnabled}
                  />
                  <span>hours</span>
                  <button
                    type="button"
                    onClick={() => updateHours(cronIntervalHours + 1)}
                    disabled={!cronEnabled || cronIntervalHours >= 24}
                    aria-label="Increase refresh interval"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
              <p className="field-help">
                {cronEnabled
                  ? "Choose a whole number from 1 to 24. Saving restarts the schedule immediately."
                  : "Manual price refresh remains available. Saving stops the existing schedule."}
              </p>
            </section>

            <div className="settings-actions">
              {notice && (
                <p className={`form-notice form-notice--${notice.type}`} role="status">
                  {notice.message}
                </p>
              )}
              <button className="primary-action-btn" type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 size={15} className="spinning-icon" /> : <Save size={15} />}
                Save settings
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
