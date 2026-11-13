// Small inline icons: 20px, 1.75 stroke, currentColor. No icon library.
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

export const BookIcon = () => (
  <svg {...base}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16" /><path d="M9 8h7" /></svg>
);
export const TextIcon = () => (
  <svg {...base}><path d="M3 18 8 6l5 12" /><path d="M4.8 14h6.4" /><path d="M15 18l3-7 3 7" /><path d="M15.9 16h4.2" /></svg>
);
export const CloseIcon = () => (
  <svg {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const SendIcon = () => (
  <svg {...base}><path d="M12 19V5" /><path d="m5.5 11.5 6.5-6.5 6.5 6.5" /></svg>
);
export const SelectionIcon = () => (
  <svg {...base}><path d="M9 4H7a2 2 0 0 0-2 2v2" /><path d="M15 4h2a2 2 0 0 1 2 2v2" /><path d="M5 16v2a2 2 0 0 0 2 2h2" /><path d="M19 16v2a2 2 0 0 1-2 2h-2" /><path d="M9 12h6" /></svg>
);
export const ImageIcon = () => (
  <svg {...base}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 3.5 3 3-2.5L20 16" /></svg>
);
export const PlayIcon = () => (
  <svg {...base} fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" /></svg>
);
export const PauseIcon = () => (
  <svg {...base} fill="currentColor" stroke="none"><rect x="6.5" y="5" width="3.8" height="14" rx="1.2" /><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" /></svg>
);
export const PrevIcon = () => (
  <svg {...base}><path d="m14.5 6-6 6 6 6" /></svg>
);
export const NextIcon = () => (
  <svg {...base}><path d="m9.5 6 6 6-6 6" /></svg>
);
export const MoreIcon = () => (
  <svg {...base} fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18.5" cy="12" r="1.7" /></svg>
);
export const ChevronIcon = () => (
  <svg {...base} width={16} height={16}><path d="m6 9 6 6 6-6" /></svg>
);
export const CheckIcon = () => (
  <svg {...base} width={16} height={16}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const PinIcon = () => (
  <svg {...base} width={16} height={16}><path d="M12 17v5" /><path d="M8 3h8l-1 6 3 4H6l3-4z" /></svg>
);
export const UploadIcon = () => (
  <svg {...base} width={26} height={26}><path d="M12 16V5" /><path d="m7.5 9.5 4.5-4.5 4.5 4.5" /><path d="M5 19h14" /></svg>
);
export const LogoMark = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="7.5" cy="12" r="4" /><circle cx="16.5" cy="12" r="4" /><path d="M11.2 12h1.6" />
  </svg>
);
