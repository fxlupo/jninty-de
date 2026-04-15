import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export default function Input({ className = "", ...rest }: InputProps) {
  const isDateInput = rest.type === "date";

  return (
    <input
      {...rest}
      lang={isDateInput ? (rest.lang ?? "de-DE") : rest.lang}
      title={isDateInput ? (rest.title ?? "Datum im Format TT.MM.JJJJ") : rest.title}
      className={`w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25 disabled:pointer-events-none disabled:opacity-50 ${className}`}
    />
  );
}
