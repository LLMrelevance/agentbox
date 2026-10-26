// THE AGENTBOX MARK: the app's own logo, wherever the app names itself.
//
// Nine dots on a dark tile with the top right one lit (picked 2026-10-25). The
// same file is the README's icon and the source of the app icon
// (scripts/make-icon.mjs). This is only ever Agentbox; projects wear their
// colour (ProductMark.tsx).

import icon from '../assets/agentbox-icon.svg?url';

export function AppMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <img
      className="product-mark app-mark"
      src={icon}
      width={size} height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
  );
}
