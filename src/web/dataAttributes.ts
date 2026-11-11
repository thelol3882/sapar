/** Presence-style `data-*` value, matched by Tailwind's `data-[flag]:` variants. */
export const flag = (on: boolean): '' | undefined => (on ? '' : undefined);
