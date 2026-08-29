export interface AdminAuditNavigation {
  readonly currentPage: number;
  readonly nextHref: string;
  readonly previousHref: string;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

function auditHref(page: number, action: string): string {
  const parameters = new URLSearchParams({ page: String(page) });
  if (action !== '') parameters.set('action', action);
  return `?${parameters.toString()}`;
}

export function adminAuditNavigation(
  currentPage: number,
  reportedPages: number,
  action: string
): AdminAuditNavigation {
  const totalPages = Math.max(1, reportedPages);
  const boundedCurrent = Math.min(totalPages, Math.max(1, currentPage));
  return {
    currentPage: boundedCurrent,
    totalPages,
    hasPrevious: boundedCurrent > 1,
    hasNext: boundedCurrent < totalPages,
    previousHref: auditHref(Math.max(1, boundedCurrent - 1), action),
    nextHref: auditHref(Math.min(totalPages, boundedCurrent + 1), action),
  };
}
