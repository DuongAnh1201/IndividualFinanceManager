"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { friendlyDate } from "@/ui/finance/dates";
import { Mochi } from "@/ui/mascots";

type Permission = NotificationPermission | "unsupported";
const NOTIFIED_KEY = "cozy-coins:notified-slots";

function notifiedSlots(): string[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** A LOCAL notification (no push service): shown through the service worker so a tap can open the app. */
async function showLocalNotification(slot: string) {
  const title = "Pay day check-in";
  const options = {
    body: `Your ${friendlyDate(slot)} pay day is waiting. Log your income when you’re ready.`,
    icon: "/icons/icon-192.png",
    tag: `payday-${slot}`,
    data: { url: `/quick-add?kind=income&payDaySlot=${encodeURIComponent(slot)}` },
  };
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options);
}

export function PayDayBanner({
  load,
  dismiss,
}: {
  load: () => Promise<{ slots: string[] }>;
  dismiss: (slot: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const pathname = usePathname();
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  // The banner renders nothing until slots load, so this lazy read cannot cause a hydration mismatch.
  const [permission, setPermission] = useState<Permission>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [tick, setTick] = useState(0);

  // Re-check on every navigation (saving an income redirects), after a dismiss, and when the tab is shown again.
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void load().then((result) => {
        if (active) setSlots(result.slots);
      });
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, load, tick]);

  // Notify at most once per pay day, and only if the person turned notifications on.
  useEffect(() => {
    if (permission !== "granted" || slots.length === 0) return;
    const done = notifiedSlots();
    const fresh = slots.filter((s) => !done.includes(s));
    if (fresh.length === 0) return;
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...done, ...fresh]));
    void showLocalNotification(fresh[0]!);
  }, [permission, slots]);

  if (slots.length === 0 || pathname.startsWith("/quick-add")) return null;

  async function enableNotifications() {
    // Only ever asked for as a direct result of this click.
    setPermission(await Notification.requestPermission());
  }

  return (
    <section className="payday-banner" aria-labelledby="payday-heading">
      <Mochi size={96} />
      <div className="payday-slots">
        <div>
          <h2 id="payday-heading">Pay day check-in</h2>
          <p>
            {slots.length === 1
              ? "A pay day is waiting for your income."
              : `${slots.length} pay days are waiting for your income.`}
          </p>
        </div>
        <ul className="payday-slots" aria-label="Pay days waiting">
          {slots.map((slot) => (
            <li key={slot} className="payday-slot">
              <strong>{friendlyDate(slot)}</strong>
              <Link className="button" href={`/quick-add?kind=income&payDaySlot=${encodeURIComponent(slot)}`}>
                Add income
                <span className="sr-only"> for the {friendlyDate(slot)} pay day</span>
              </Link>
              <button
                type="button"
                className="quiet-button"
                onClick={async () => {
                  const result = await dismiss(slot);
                  setError(result.ok ? undefined : result.error);
                  if (result.ok) setTick((t) => t + 1);
                }}
              >
                Dismiss
                <span className="sr-only"> the {friendlyDate(slot)} reminder</span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {permission === "default" && (
          <button type="button" className="quiet-button" onClick={enableNotifications}>
            Remind me on this device
          </button>
        )}
        {permission === "denied" && (
          <p className="muted">
            Notifications are blocked in your browser settings. The banner will still appear here.
          </p>
        )}
      </div>
    </section>
  );
}
