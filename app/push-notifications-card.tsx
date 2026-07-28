"use client";

import { useEffect, useState } from "react";

type Settings = { configured: boolean; publicKey: string | null; enabled: boolean; preferences: { notifyMovies: boolean; notifyTv: boolean } };

function urlBase64ToUint8Array(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function PushNotificationsCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const load = async () => {
    const response = await fetch("/api/push-subscriptions", { cache: "no-store" });
    if (response.ok) setSettings(await response.json() as Settings);
  };
  useEffect(() => { void load(); }, []);
  const updatePreferences = async (notifyMovies: boolean, notifyTv: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, preferences: { notifyMovies, notifyTv } });
    if (!settings.enabled) return;
    const response = await fetch("/api/push-subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notifyMovies, notifyTv }) });
    if (!response.ok) { setMessage("Your alert choices could not be saved. Please try again."); await load(); }
  };
  const enable = async () => {
    if (!supported || !settings?.publicKey) return;
    setWorking(true); setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage("Notifications are blocked in your device settings."); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(settings.publicKey) });
      const response = await fetch("/api/push-subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON(), ...settings.preferences }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) { setMessage(data.error ?? "This device could not be registered for alerts."); return; }
      setSettings({ ...settings, enabled: true }); setMessage("Release alerts are on for this device.");
    } catch { setMessage("This device could not enable alerts. Try adding CineApe to your Home Screen first."); }
    finally { setWorking(false); }
  };
  const disable = async () => {
    if (!settings) return;
    setWorking(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await fetch("/api/push-subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription?.endpoint }) });
      await subscription?.unsubscribe(); setSettings({ ...settings, enabled: false }); setMessage("Release alerts are off on this device.");
    } catch { setMessage("Release alerts could not be turned off. Please try again."); }
    finally { setWorking(false); }
  };
  return <article className="panel profile-next push-alert-card"><p className="eyebrow">MOBILE ALERTS</p><h2>New release alerts</h2><p>Get a simple phone or tablet alert when a notable new movie or TV series arrives.</p>
    {!supported ? <small>Notifications are not available in this browser. On iPhone and iPad, add CineApe to your Home Screen first.</small> : !settings?.configured ? <small>Release alerts are being set up.</small> : <>
      <label><input type="checkbox" checked={settings.preferences.notifyMovies} onChange={event => void updatePreferences(event.target.checked, settings.preferences.notifyTv)} /> New movie releases</label>
      <label><input type="checkbox" checked={settings.preferences.notifyTv} onChange={event => void updatePreferences(settings.preferences.notifyMovies, event.target.checked)} /> New TV series</label>
      <button className={settings.enabled ? "secondary" : "primary"} onClick={() => void (settings.enabled ? disable() : enable())} disabled={working}>{working ? "Updating…" : settings.enabled ? "Turn off release alerts" : "Turn on release alerts"}</button>
    </>}
    {message && <small className="push-alert-message">{message}</small>}
  </article>;
}
