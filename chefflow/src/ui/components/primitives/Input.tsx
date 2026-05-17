import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Icon rendered on the left inside the input */
  iconLeft?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, iconLeft, className = '', id, ...rest },
  ref,
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-slate-300 dark:text-slate-400"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {iconLeft && (
          <span
            className="absolute left-3 flex items-center text-slate-400 pointer-events-none"
            aria-hidden="true"
          >
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          aria-invalid={error ? 'true' : undefined}
          className={[
            'w-full rounded-md border px-3 py-2 text-base',
            'bg-surface-2 text-slate-100 border-[rgba(255,255,255,0.08)]',
            'placeholder:text-slate-500',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'light:bg-white light:text-slate-900 light:border-slate-300',
            error ? 'border-danger focus:ring-danger' : '',
            iconLeft ? 'pl-10' : '',
            className,
          ].join(' ')}
          {...rest}
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
});

export default Input;
