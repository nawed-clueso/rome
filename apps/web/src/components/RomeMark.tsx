import type { SVGProps } from "react";

import romeAppIconUrl from "../assets/rome-app-icon.png";

/** Rome's mark: a single soft arch, as on the app icon. */
export function RomeMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.4 18.6C5.4 11.4 8.4 5.6 12 5.6s6.6 5.8 6.6 13"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The full-colour app icon, for places that show Rome itself rather than a glyph. */
export function RomeAppIcon(props: { readonly className?: string }) {
  return <img src={romeAppIconUrl} alt="" aria-hidden className={props.className} />;
}
