import React from 'react';

/** Линейные иконки 24×24: цвет берут от текста, толщина одна на всё приложение. */

function Icon({ children, size = 22 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const TodayIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const WorkIcon = () => (
  <Icon>
    <path d="M5 4.5h3l1.5 4-2 1.3a11 11 0 0 0 6.7 6.7l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 6.7 2 2 0 0 1 5 4.5Z" />
  </Icon>
);

export const MoneyIcon = () => (
  <Icon>
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M3 10h18M7 15h3" />
  </Icon>
);

export const RatingIcon = () => (
  <Icon>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
  </Icon>
);

export const ScanIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" />
  </Icon>
);

export const ExitIcon = () => (
  <Icon size={20}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </Icon>
);

export const CheckIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const PinIcon = () => (
  <Icon size={18}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </Icon>
);

export const MedalIcon = () => (
  <Icon size={20}>
    <circle cx="12" cy="14" r="5.5" />
    <path d="m8.5 9.5-3-6.5h4l2.5 5M15.5 9.5l3-6.5h-4L12 8" />
  </Icon>
);
