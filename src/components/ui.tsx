import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';

const RetainedWorkspaceHidden = createContext(false);

export function RetainedWorkspace({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return (
    <RetainedWorkspaceHidden.Provider value={hidden}>
      <div hidden={hidden}>{children}</div>
    </RetainedWorkspaceHidden.Provider>
  );
}
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
  const suspended = useContext(RetainedWorkspaceHidden);
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useId();
  useEffect(() => {
    if (suspended) return;
    const focus = document.activeElement as HTMLElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (focus?.isConnected) focus.focus();
    };
  }, [suspended]);
  return (
    <dialog
      ref={dialog}
      hidden={suspended}
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
