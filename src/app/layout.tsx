import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cozy Coins",
  description: "Individual finance manager",
};

// Placeholder shell — codex1 replaces this in #5 (theme, fonts, navigation).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{ margin: 0, background: "#E4E0D9", color: "#33302C", fontFamily: "system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
