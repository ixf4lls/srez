/**
 * Shared interaction recipes.
 *
 * The library draws focus as a 3px drop-shadow (`Box Shadow/Focus ring`,
 * neutral-400 @ 50%) plus a `ring`-coloured 1px border — not an offset outline.
 * Invalid controls swap in `Box Shadow/Destructive` (red @ 20%).
 */
export const focusRing =
  "outline-none focus-visible:border-ring focus-visible:ring-ring-subtle focus-visible:ring-[3px]";

export const invalidRing =
  "aria-invalid:border-destructive aria-invalid:ring-ring-destructive aria-invalid:ring-[3px]";

/** Every interactive component dims to 50% when disabled. */
export const disabled = "disabled:pointer-events-none disabled:opacity-50";

/** Icons inside controls are 16px with a 2px stroke and never shrink. */
export const controlIcon =
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/**
 * Icon placement inside Button, Badge and their content slots.
 *
 * Docs: "Remember to add the data-icon='inline-start' or data-icon='inline-end'
 * attribute to the icon for the correct spacing."
 *
 * The attribute tightens the optical gap on the outer edge so a leading or
 * trailing glyph sits closer to the box edge than the label does.
 */
export const inlineIcon =
  "[&_[data-icon=inline-start]]:-ms-0.5 [&_[data-icon=inline-end]]:-me-0.5";
