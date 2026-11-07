// One icon set, shared by the sidebar, the top bar, the Help page and the tour so the
// same tool never shows two glyphs. Port of ICONS/svg() in rie-dashboard2/js/help.js;
// the old code injected the markup as strings, here each glyph is JSX.

export const ICONS = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  columns: <><rect x="3" y="3" width="5" height="18" rx="1.5" /><rect x="10" y="3" width="5" height="12" rx="1.5" /><rect x="17" y="3" width="4" height="15" rx="1.5" /></>,
  tree: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="M6 7v12M6 12h10M6 19h10" /></>,
  check: <path d="m4 12 5 5L20 6" />,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  funnel: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.2 2.3 3.5 5.2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  arrowup: <><path d="M12 20V6M6 12l6-6 6 6" /><path d="M5 3h14" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="m12 18 4-6" /></>,
  pulse: <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
  chart: <><path d="M4 20V4M4 20h16" /><rect x="8" y="12" width="3" height="5" rx=".6" /><rect x="13" y="8" width="3" height="9" rx=".6" /><rect x="18" y="5" width="2.5" height="12" rx=".6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.2-1-1.4-1-2.5 0-.9.7-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  shield: <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8M12 17.3v.2" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  pencil: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  note: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  alert: <><path d="M12 4 2.5 20h19z" /><path d="M12 10v4M12 17.5v.01" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-4" /><path d="M4 3v4h4" /><path d="M4 13a8 8 0 0 0 14.9 4" /><path d="M20 21v-4h-4" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /><path d="M16 13.5h.01" /></>,
  badge: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 17c.5-2 2-3 3.5-3s3 1 3.5 3M15 9.5h4M15 13h3" /></>,
};

export function Icon({ name, size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {ICONS[name] || null}
    </svg>
  );
}
