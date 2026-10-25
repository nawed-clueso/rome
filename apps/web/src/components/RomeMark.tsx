import type { SVGProps } from "react";

/** Rome's mark: an arch on its plinth. */
export function RomeMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.5 19V11a7.5 7.5 0 0 1 15 0v8h-3.4v-7.6a4.1 4.1 0 0 0-8.2 0V19H4.5Z"
        fill="currentColor"
      />
      <rect x="3" y="20.2" width="18" height="1.6" rx="0.8" fill="currentColor" />
    </svg>
  );
}
