"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card empty-state">
      <h1>A small pause.</h1>
      <p>We couldn’t load your money space. Please try again.</p>
      <button type="button" className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
