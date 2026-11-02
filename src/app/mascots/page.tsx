import type { Metadata } from "next";
import { Penny, Mochi, bottleMascots, type PennyMood } from "@/ui/mascots";

export const metadata: Metadata = { title: "Meet the buddies" };
const moods: { mood: PennyMood; title: string; status: string }[] = [
  { mood: "happy", title: "Happy Penny", status: "Under 80% of the living limit" },
  { mood: "worried", title: "Worried Penny", status: "80% to below 100% of the living limit" },
  { mood: "dizzy", title: "Dizzy Penny", status: "100% or more of the living limit" },
];
export default function MascotGallery() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">The Cozy Coins cast</p>
          <h1>Little buddies, big heart.</h1>
          <p>Original characters to keep your money company.</p>
        </div>
        <span className="pill">Mascot gallery</span>
      </div>
      <h2>Penny’s moods</h2>
      <p className="muted">Preview states, paired with text so status never depends on a face or color.</p>
      <div className="gallery-grid">
        {moods.map(({ mood, title, status }) => (
          <article className="card gallery-card" key={mood}>
            <Penny mood={mood} size={160} label={title} />
            <h3>{title}</h3>
            <p>{status}</p>
          </article>
        ))}
      </div>
      <h2 className="gallery-heading">The bottle buddies</h2>
      <div className="gallery-grid">
        {bottleMascots.map(({ key, name, bottle, Component }) => (
          <article className="card gallery-card" key={key}>
            <Component size={144} label={name} />
            <h3>{name}</h3>
            <p>{bottle}</p>
          </article>
        ))}
      </div>
      <h2 className="gallery-heading">A gentle payday nudge</h2>
      <section className="card payday-preview">
        <Mochi size={128} label="Mochi the cat" />
        <div>
          <p className="eyebrow">Mochi · reminder preview</p>
          <h3>Payday! Feed the bottles 🐾</h3>
          <p>A friendly reminder for when it’s time to log your income.</p>
          <p className="muted">Visual preview only; no reminder is due or scheduled.</p>
        </div>
      </section>
    </>
  );
}
