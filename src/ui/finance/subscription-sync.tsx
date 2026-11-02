"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function SubscriptionSync({ sync }: { sync: () => Promise<{ changed: boolean; error?: string }> }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const result = await sync();
        if (!active) return;
        setError(result.error);
        if (result.changed) router.refresh();
      } catch {
        if (active) setError("Subscription charges couldn’t be checked. Please refresh to try again.");
      } finally {
        busy = false;
      }
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void check(), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, sync]);
  return error ? (
    <p className="inline-notice sync-notice" role="status">
      {error}
    </p>
  ) : null;
}
