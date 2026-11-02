"use client";
import { useEffect } from "react";

/** Registers the local-only service worker (installability + local notifications). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);
  return null;
}
