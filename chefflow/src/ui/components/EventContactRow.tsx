import { Mail, Phone, User } from 'lucide-react';

interface Props {
  name?: string;
  email?: string;
  phone?: string;
}

/**
 * Inline contact strip — name + mailto + tel — used on the event detail
 * card. Extracted from EventView so the page focuses on layout and this
 * one renders the read-only details + handles the mailto/tel formatting.
 *
 * Renders nothing when all three fields are empty.
 */
export default function EventContactRow({ name, email, phone }: Props) {
  if (!name && !email && !phone) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-400">
      {name && (
        <span className="inline-flex items-center gap-2">
          <User className="h-4 w-4" aria-hidden="true" />
          {name}
        </span>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className="inline-flex items-center gap-2 hover:text-accent hover:underline"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {email}
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone.replace(/[^+\d]/g, '')}`}
          className="inline-flex items-center gap-2 hover:text-accent hover:underline"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          {phone}
        </a>
      )}
    </div>
  );
}
