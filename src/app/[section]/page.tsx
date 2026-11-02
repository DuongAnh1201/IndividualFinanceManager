import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/ui/empty-state";

const sections: Record<string, { title: string; description: string }> = {
  bottles: {
    title: "Income & Bottles",
    description:
      "Your income, allocations and bottle balances will appear here. No balances have been calculated yet.",
  },
  reports: {
    title: "Reports",
    description:
      "Week, month and year comparisons will help you see where your money goes. Reports need financial data and are coming in a later phase.",
  },
  settings: {
    title: "Settings",
    description:
      "Bottle ratios, categories, currencies, pay days and backups will be managed here. Settings controls are coming in a later phase.",
  },
};
export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  return { title: sections[(await params).section]?.title ?? "Page not found" };
}
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = Object.hasOwn(sections, section) ? sections[section] : undefined;
  if (!content) notFound();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your cozy money space</p>
          <h1>{content.title}</h1>
        </div>
        <span className="pill">Coming soon</span>
      </div>
      <EmptyState title="Something good is growing here." description={content.description} />
    </>
  );
}
