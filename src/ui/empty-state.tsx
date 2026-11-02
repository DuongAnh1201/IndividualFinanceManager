import Link from "next/link";
import { Penny } from "@/ui/mascots";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="card empty-state">
      <Penny size={144} />
      <p className="eyebrow">A little room to grow</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link href="/mascots" className="text-link">
        Meet your money buddies <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
