import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { controlIcon, disabled, focusRing, inlineIcon } from "@/lib/focus";

/**
 * figma: Button — 192 variants (Variant x Size x State x Roudness).
 *
 * Measured geometry:
 *   xs       h 24  px 8   gap 4  rounded-sm  text-xs/500
 *   sm       h 28  px 10  gap 4  rounded-sm  text-xs/500
 *   default  h 32  px 10  gap 4  rounded-lg  text-sm/500
 *   lg       h 36  px 10  gap 4  rounded-lg  text-sm/500
 *
 * One step smaller than upstream shadcn, whose default is h-9.
 *
 * The Figma `Roudness` axis is not a prop — the docs say
 * "Use the rounded-full class to make the button rounded", so it is applied
 * with `className="rounded-full"`.
 *
 * Icons carry data-icon="inline-start" | "inline-end" for correct spacing.
 */
const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap font-medium transition-all",
    controlIcon,
    inlineIcon,
    focusRing,
    disabled,
    "aria-invalid:border-destructive aria-invalid:ring-ring-destructive aria-invalid:ring-[3px]"
  ),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-ring-destructive",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 rounded-sm px-2 text-xs",
        sm: "h-7 rounded-sm px-2.5 text-xs",
        default: "h-8 rounded-lg px-2.5 text-sm",
        lg: "h-9 rounded-lg px-2.5 text-sm",
      },
    },
    compoundVariants: [{ variant: "link", className: "px-0 shadow-none" }],
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
