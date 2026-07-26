import Link from "next/link";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
/**
 * "md" = the sans-serif, sentence-case, rounded-lg register used on
 * marketing/auth surfaces (AuthCard, ContactForm). "sm" = the mono,
 * uppercase-tracked, rounded-sm register used everywhere else (nav, cards,
 * map popups, badges) — the app's own established two-register type system,
 * not something this component invents.
 */
export type ButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-dim border border-transparent",
  secondary: "border border-border text-muted hover:border-accent hover:text-accent bg-transparent",
  ghost: "border border-accent/40 bg-accent/10 text-accent hover:border-accent hover:bg-accent/20",
  danger: "border border-negative/40 text-negative hover:bg-negative/10 bg-transparent",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "rounded-lg px-4 py-2.5 text-sm font-semibold",
  sm: "rounded-sm px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide",
};

const SHARED_CLASS =
  "inline-flex items-center justify-center gap-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/** The one button primitive for public pages — consolidates what were 6+ hand-styled variants. Renders a Next `Link` when `href` is passed, otherwise a real `<button>`. */
const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", fullWidth, className = "", children, ...props },
  ref
) {
  const classes = `${SHARED_CLASS} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${fullWidth ? "w-full" : ""} ${className}`;

  if ("href" in props && props.href) {
    const { href, ...anchorProps } = props;
    return (
      <Link href={href} ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...anchorProps}>
        {children}
      </Link>
    );
  }

  const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" ref={ref as React.Ref<HTMLButtonElement>} className={classes} {...buttonProps}>
      {children}
    </button>
  );
});

export default Button;
