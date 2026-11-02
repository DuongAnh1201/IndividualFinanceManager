import Link from "next/link";
import { Penny } from "@/ui/mascots";
export default function NotFound() {
  return (
    <section className="card empty-state">
      <Penny mood="worried" size={140} />
      <h1>This page wandered off.</h1>
      <p>Let’s find our way back to your cozy corner.</p>
      <Link href="/" className="button">
        Back to dashboard
      </Link>
    </section>
  );
}
