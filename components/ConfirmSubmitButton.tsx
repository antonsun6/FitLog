"use client";

/**
 * A plain submit button that asks for confirmation first — for the more
 * destructive server actions (delete a whole exercise or session) where a
 * misclick is costly. Deliberately not used for single-set delete/edit,
 * which are frequent, low-stakes, and trivially correctable by re-logging.
 * Still works as a normal form submit button if JS is disabled — it just
 * skips the confirmation in that case.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  className,
}: {
  confirmMessage: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
