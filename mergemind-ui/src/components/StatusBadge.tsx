import type { Severity, VerificationStatus, AgentStatus } from '@/types/semantic';

interface SeverityBadgeProps {
  severity: Severity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const cls = severity === 'HIGH' ? 'badge-high' : severity === 'MEDIUM' ? 'badge-medium' : 'badge-low';
  return (
    <span className={`badge ${cls}`}>
      {severity === 'HIGH' && <TriangleIcon />}
      {severity}
    </span>
  );
}

interface StatusBadgeProps {
  status: VerificationStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cls = status === 'PASS' ? 'badge-pass' : status === 'FAIL' ? 'badge-fail' : 'badge';
  return <span className={`badge ${cls}`}>{status}</span>;
}

interface AgentStatusBadgeProps {
  status: AgentStatus;
}

export function AgentStatusBadge({ status }: AgentStatusBadgeProps) {
  if (status === 'RUNNING')  return <span className="badge badge-blue">Running</span>;
  if (status === 'COMPLETE') return <span className="badge badge-pass">Complete</span>;
  if (status === 'ERROR')    return <span className="badge badge-fail">Error</span>;
  return <span className="badge" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)', background: 'transparent' }}>Pending</span>;
}

function TriangleIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 1L9.33 8.5H0.67L5 1Z" fill="currentColor"/>
    </svg>
  );
}
