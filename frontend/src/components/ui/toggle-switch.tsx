/**
 * iOS-style toggle switch — works correctly in RTL.
 * Uses CSS logical properties (inset-inline-start) for proper RTL support.
 */

import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const SIZES = {
  sm: { track: "w-[34px] h-[20px]", thumb: "w-4 h-4", on: "16px", off: "2px" },
  md: { track: "w-[51px] h-[31px]", thumb: "w-[27px] h-[27px]", on: "22px", off: "2px" },
  lg: { track: "w-[58px] h-[34px]", thumb: "w-[30px] h-[30px]", on: "26px", off: "2px" },
};

export default function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = "md",
  label,
  className,
}: ToggleSwitchProps) {
  const s = SIZES[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        checked ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600",
        disabled && "opacity-50 cursor-not-allowed",
        s.track,
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute rounded-full bg-white shadow-md ring-0 transition-all duration-200 ease-in-out",
          s.thumb,
        )}
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          insetInlineStart: checked ? s.on : s.off,
        }}
      />
    </button>
  );
}
