import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import Link from "next/link";
import { Penny } from "@/ui/mascots";
import { Navigation } from "@/ui/navigation";
import { SubscriptionSync } from "@/ui/finance/subscription-sync";
import { syncDueSubscriptions } from "./actions";
import "./globals.css";

const nunito = localFont({
  src: "../ui/fonts/Nunito.ttf",
  variable: "--font-nunito",
  display: "swap",
  weight: "200 1000",
});
export const metadata: Metadata = {
  title: { default: "Cozy Coins", template: "%s · Cozy Coins" },
  description: "A cozy place for your everyday money.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <div className="app-shell">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <Penny size={54} />
              <span>
                Cozy Coins<small>A little care, every day</small>
              </span>
            </Link>
            <Navigation />
            <div className="sidebar-note">
              <span className="eyebrow">Small steps. Softer landings.</span>
              <p>Make a little space for what matters.</p>
              <Link href="/mascots" className="text-link">
                Meet the buddies
              </Link>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <span>Your money, at home.</span>
              <Link href="/quick-add" className="button">
                <span aria-hidden="true">＋</span> Quick add
              </Link>
            </header>
            <main id="main-content" tabIndex={-1}>
              <SubscriptionSync sync={syncDueSubscriptions} />
              {children}
            </main>
            <footer>
              Cozy Coins <span aria-hidden="true">·</span> One small step at a time
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
