import type { ReactNode } from "react";

interface PageContainerProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The shell's page container: one spacing system, one page-header shape, for
 * every authenticated page.
 *
 * The prototype's own page padding lived on its `.page-main`; here the
 * container owns it (`.page-surface`, from the global stylesheet) so the
 * Command Center surface and these pages line up. Structure and the `h1` are
 * unchanged - only the surface classes.
 */
export function PageContainer({ title, description, actions, children }: PageContainerProps) {
  return (
    <div className="page-surface">
      <div className="page-header">
        <div className="page-header__copy">
          <h1 className="page-header__title">{title}</h1>
          {description && <p className="page-header__description">{description}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
