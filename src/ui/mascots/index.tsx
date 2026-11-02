import type { ReactNode } from "react";

export type MascotProps = { size?: number; label?: string; className?: string };
export type PennyMood = "happy" | "worried" | "dizzy";

function Drawing({ children, size = 112, label, className }: MascotProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      fill="none"
      stroke="var(--text, #33302C)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function Face({ y = 61 }: { y?: number }) {
  return (
    <>
      <path d={`M48 ${y}v2m24-2v2`} />
      <path d={`M55 ${y + 10}q5 5 10 0`} />
      <path d={`M39 ${y + 7}h4m34 0h4`} stroke="var(--danger, #B07A5E)" />
    </>
  );
}

/** Original piggy-bank character; pair moods with visible status text. */
export function Penny({ mood = "happy", ...props }: MascotProps & { mood?: PennyMood }) {
  return (
    <Drawing {...props}>
      <path d="M33 41 29 22q20 1 22 14m29 1 12-14 1 24" fill="var(--danger, #B07A5E)" />
      <path d="M94 61q19-10 17 3t-12 0" />
      <path d="M27 87v14h14l3-10m32 0 3 10h14V84" fill="var(--danger, #B07A5E)" />
      <ellipse cx="60" cy="64" rx="43" ry="32" fill="var(--surface-2, #D9D3C9)" />
      <path d="M51 39h18" />
      <ellipse cx="60" cy="77" rx="14" ry="9" fill="var(--danger, #B07A5E)" />
      <path d="M55 77h1m8 0h1" />
      {mood === "dizzy" ? (
        <path d="m38 54 10 10m0-10L38 64m34-10 10 10m0-10L72 64M55 91l5-3 5 3" />
      ) : (
        <>
          <path d="M42 57v3m34-3v3" />
          {mood === "worried" ? (
            <path d="m36 48 11 3m26 0 11-3M54 91q6-7 12 0" />
          ) : (
            <path d="M53 91q7 6 14 0" />
          )}
        </>
      )}
      <circle cx="60" cy="18" r="10" fill="var(--warn, #C49A5A)" />
      <path d="M60 13v10" />
    </Drawing>
  );
}

export function Nest(props: MascotProps) {
  return (
    <Drawing {...props}>
      <path d="M22 85q38 34 76 0l-8 18H30Z" fill="var(--warn, #C49A5A)" />
      <path
        d="M32 80q-8-35 18-41-7-17 5-17 7-13 13-1 16-5 10 13 19 17 10 46"
        fill="var(--surface, #EEEBE6)"
      />
      <path d="m54 59 6 7 6-7Z" fill="var(--warn, #C49A5A)" />
      <path d="M46 53v2m28-2v2M35 79l11 7m39-7-11 7M31 92h58" />
    </Drawing>
  );
}
export function TurtleTuck(props: MascotProps) {
  return (
    <Drawing {...props}>
      <path d="M28 84 21 97h15l9-13m29 0 9 13h14L87 82" fill="var(--accent, #7C8C78)" />
      <path d="M20 82q0-44 40-44t40 44Z" fill="var(--accent, #7C8C78)" />
      <path d="m35 68 13-16h24l13 16-12 14H47Zm13-16-5-9m29 9 5-9" />
      <ellipse cx="60" cy="79" rx="22" ry="18" fill="var(--surface-2, #D9D3C9)" />
      <Face y={74} />
    </Drawing>
  );
}
export function Sprout(props: MascotProps) {
  return (
    <Drawing {...props}>
      <path
        d="M60 64V29m0 17Q25 49 29 22q28-3 31 24Zm0-9q3-25 31-23 4 25-31 23Z"
        fill="var(--accent, #7C8C78)"
      />
      <path d="m30 57 7 42q23 13 46 0l7-42Z" fill="var(--warn, #C49A5A)" />
      <path d="M27 56h66v12H27Z" fill="var(--surface-2, #D9D3C9)" />
      <Face y={78} />
    </Drawing>
  );
}
export function Owlie(props: MascotProps) {
  return (
    <Drawing {...props}>
      <path
        d="m27 45-1-23 23 14q12-5 23 0l23-14-1 25q16 54-34 56T27 45Z"
        fill="var(--chart-latte, #A3907A)"
      />
      <path d="m48 102-4 6m28-6 4 6M29 65l9 22m53-22-9 22" />
      <circle cx="45" cy="59" r="15" fill="var(--surface, #EEEBE6)" />
      <circle cx="75" cy="59" r="15" fill="var(--surface, #EEEBE6)" />
      <path d="M45 57v4m30-4v4m-21 12 6 7 6-7Z" />
    </Drawing>
  );
}
export function Bun(props: MascotProps) {
  return (
    <Drawing {...props}>
      <path d="M38 52Q14 8 34 9q17 0 18 40m16 0Q69 5 86 9q19 3-4 44" fill="var(--chart-mauve, #B59AA6)" />
      <ellipse cx="60" cy="73" rx="35" ry="29" fill="var(--surface, #EEEBE6)" />
      <Face y={67} />
      <path d="m56 76 4 4 4-4M32 103h56" />
    </Drawing>
  );
}
export function BeeKind(props: MascotProps) {
  return (
    <Drawing {...props}>
      <path d="M56 46Q24 7 17 36q-2 23 35 24m12-14Q96 7 103 36q2 23-35 24" fill="var(--surface, #EEEBE6)" />
      <ellipse cx="60" cy="72" rx="31" ry="32" fill="var(--warn, #C49A5A)" />
      <path d="M33 86h54M41 97h38M49 42l-6-14m28 14 6-14" />
      <Face y={59} />
      <path d="m56 105 4 7 4-7" />
    </Drawing>
  );
}
export function Mochi(props: MascotProps) {
  return (
    <Drawing {...props}>
      <path d="M82 88q29 5 22-15-6-12-12-1" />
      <path d="M32 55 29 23l25 17h13l25-17-3 32q14 44-29 46T32 55Z" fill="var(--chart-latte, #A3907A)" />
      <Face y={61} />
      <path d="M29 69 15 65m14 12-14 2m76-10 14-4M91 77l14 2M51 92v9m18-9v9m-13-27 4 4 4-4" />
    </Drawing>
  );
}

export const bottleMascots = [
  { key: "nest", name: "Nest", bottle: "Necessities", Component: Nest },
  { key: "turtle-tuck", name: "Turtle Tuck", bottle: "Long-term Savings", Component: TurtleTuck },
  { key: "sprout", name: "Sprout", bottle: "Financial Freedom", Component: Sprout },
  { key: "owlie", name: "Owlie", bottle: "Education", Component: Owlie },
  { key: "bun", name: "Bun", bottle: "Play", Component: Bun },
  { key: "bee-kind", name: "Bee Kind", bottle: "Give", Component: BeeKind },
] as const;
