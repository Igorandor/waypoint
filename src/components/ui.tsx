import { useEffect, useId, useRef, type ReactNode } from 'react';
export const Badge = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) => (
  <span className={'badge ' + tone}>{children}</span>
);
export const Loading = () => (
  <p role="status" className="waypoint-loading">
    Reading the instance…
  </p>
);
export const ErrorBox = ({ error, retry }: { error: string; retry?: () => void }) => (
  <div role="alert" className="error-box">
    {error}
    {retry && <button onClick={retry}>Retry read</button>}
  </div>
);
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="inline-actions">{children}</div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useId();
  useEffect(() => {
    const focus = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => focus?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="waypoint-dialog"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id={heading}>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
