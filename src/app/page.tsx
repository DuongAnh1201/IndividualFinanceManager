import Link from "next/link";
import { Penny, bottleMascots } from "@/ui/mascots";

export default function Home() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your everyday money companion</p>
          <h1>A cozy place to begin.</h1>
          <p>A little clarity for today. A little room for tomorrow.</p>
        </div>
        <span className="pill">Getting started</span>
      </div>
      <section className="card welcome">
        <div>
          <p className="eyebrow">Hello from Penny</p>
          <h2>
            Let’s give your money
            <br />a happy little home.
          </h2>
          <p>
            Your dashboard will bring spending, living limits and upcoming subscriptions together. There’s no
            financial data to show here yet.
          </p>
          <Link href="/quick-add" className="button">
            Explore Quick add <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="mascot-orbit">
          <Penny size={220} />
        </div>
      </section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">A home for every purpose</p>
          <h2>Meet your bottle buddies</h2>
        </div>
        <Link href="/mascots" className="text-link">
          View the gallery ↗
        </Link>
      </div>
      <div className="bottle-grid">
        {bottleMascots.map(({ key, name, bottle, Component }) => (
          <article key={key} className="card bottle-card">
            <Component size={88} />
            <h3>{bottle}</h3>
            <p>{name}</p>
            <span className="muted">Balance not available yet</span>
          </article>
        ))}
      </div>
      <section className="notice">
        <h2>Growing one piece at a time</h2>
        <p>
          This is the app’s visual foundation. Transaction entry, balances and reports will arrive in the next
          phases.
        </p>
      </section>
    </>
  );
}
