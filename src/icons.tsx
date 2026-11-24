// One stroke icon set: 16px box, 1.6 stroke, round caps. Drawn here so the app ships no icon font.
import type { ReactNode } from "react";

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const Back = () => <Icon><path d="M10 3.5 5.5 8l4.5 4.5" /></Icon>;
export const Forward = () => <Icon><path d="M6 3.5 10.5 8 6 12.5" /></Icon>;
export const Up = () => <Icon><path d="M8 13V3.5M4 7.5l4-4 4 4" /></Icon>;
export const Minus = () => <Icon><path d="M4 8h8" /></Icon>;
export const Plus = () => <Icon><path d="M4 8h8M8 4v8" /></Icon>;
export const Rescan = () => (
  <Icon>
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13 2.8v2.7h-2.7" />
  </Icon>
);
export const Drive = () => (
  <Icon>
    <rect x="2" y="4" width="12" height="8" rx="1.8" />
    <path d="M10.5 9.2h.01M12 9.2h.01" strokeWidth={2} />
  </Icon>
);
export const Reveal = () => (
  <Icon>
    <path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
  </Icon>
);
export const Sun = () => (
  <Icon>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
  </Icon>
);
export const Moon = () => (
  <Icon>
    <path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z" />
  </Icon>
);
export const System = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 2.5v11" />
    <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
  </Icon>
);
export const Chevron = () => <Icon size={12}><path d="M6 3.5 10.5 8 6 12.5" /></Icon>;

/** Brand mark: a four-tile treemap. */
export const Mark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false" className="mark">
    <rect x="1" y="1" width="9" height="16" rx="1.5" className="m1" />
    <rect x="11" y="1" width="6" height="8" rx="1.5" className="m2" />
    <rect x="11" y="10" width="6" height="3.5" rx="1" className="m3" />
    <rect x="11" y="14.5" width="6" height="2.5" rx="1" className="m4" />
  </svg>
);
