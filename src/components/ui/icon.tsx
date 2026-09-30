import type { ElementType } from "react";

type IconComponent = ElementType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

interface IconProps {
  icon: IconComponent;
  size?: 14 | 16 | 20 | 24 | 32 | 48;
  className?: string;
  /** Mark a purely decorative icon so screen readers skip it. */
  "aria-hidden"?: boolean;
}

export function Icon({
  icon: I,
  size = 16,
  className,
  "aria-hidden": ariaHidden,
}: IconProps) {
  return (
    <I
      size={size}
      strokeWidth={1.5}
      className={className}
      aria-hidden={ariaHidden}
    />
  );
}
