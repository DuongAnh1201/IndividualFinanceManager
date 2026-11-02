"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const destinations = [
  { href: "/", name: "Dashboard", mark: "◉" },
  { href: "/transactions", name: "Transactions", mark: "⇄" },
  { href: "/subscriptions", name: "Subscriptions", mark: "↻" },
  { href: "/bottles", name: "Income & Bottles", mark: "♧" },
  { href: "/reports", name: "Reports", mark: "▥" },
  { href: "/settings", name: "Settings", mark: "⚙" },
] as const;

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="navigation">
      {destinations.map(({ href, name, mark }) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
          <span aria-hidden="true">{mark}</span>
          {name}
        </Link>
      ))}
    </nav>
  );
}
