import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, id, className, ...rest }: TextFieldProps) {
  const inputId = id ?? `field-${label}`;
  return (
    <div className={["text-field", className].filter(Boolean).join(" ")}>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} {...rest} />
    </div>
  );
}
