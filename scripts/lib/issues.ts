/**
 * A single validation finding.
 *
 * `rule` is a stable identifier, not prose: the tests in scripts/__tests__ assert on
 * rule ids, so a reworded message never breaks a test and a renamed rule always does.
 */
export interface Issue {
  rule: string;
  severity: 'error' | 'warning';
  /** Repo-relative file the finding belongs to. */
  file: string;
  /** Dotted path inside the file, e.g. `entities[3].policy_areas[0]`. */
  path?: string;
  message: string;
}

export function error(rule: string, file: string, message: string, path?: string): Issue {
  return { rule, severity: 'error', file, message, ...(path ? { path } : {}) };
}

export function warning(rule: string, file: string, message: string, path?: string): Issue {
  return { rule, severity: 'warning', file, message, ...(path ? { path } : {}) };
}

export function countBySeverity(issues: Issue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

/** Groups by file and renders a report that reads well in a terminal. */
export function formatIssues(issues: Issue[]): string {
  if (issues.length === 0) return '';

  const byFile = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = byFile.get(issue.file);
    if (list) list.push(issue);
    else byFile.set(issue.file, [issue]);
  }

  const lines: string[] = [];
  for (const file of [...byFile.keys()].sort()) {
    lines.push('');
    lines.push(file);
    for (const issue of byFile.get(file) ?? []) {
      const marker = issue.severity === 'error' ? 'error  ' : 'warning';
      const where = issue.path ? `${issue.path}: ` : '';
      lines.push(`  ${marker}  ${where}${issue.message}  [${issue.rule}]`);
    }
  }
  return lines.join('\n');
}
