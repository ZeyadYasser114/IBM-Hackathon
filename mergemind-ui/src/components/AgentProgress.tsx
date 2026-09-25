import type { AgentRun } from '@/types/semantic';
import { AgentStatusBadge } from './StatusBadge';

interface AgentProgressProps {
  agents: AgentRun[];
}

const AGENT_ICONS: Record<string, string> = {
  'agent-intent':     '🎯',
  'agent-change':     '🔍',
  'agent-contract':   '📋',
  'agent-dependency': '🔗',
  'agent-adversary':  '⚔️',
};

export function AgentProgress({ agents }: AgentProgressProps) {
  const completed = agents.filter((a) => a.status === 'COMPLETE').length;
  const pct = Math.round((completed / agents.length) * 100);

  return (
    <div className="stack gap-4">
      {/* Progress header */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Bob Analysis Agents</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{completed}/{agents.length} complete</span>
      </div>

      {/* Progress track */}
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>

      {/* Agent list */}
      <div className="stack gap-3" style={{ marginTop: 'var(--sp-2)' }}>
        {agents.map((agent, idx) => (
          <AgentRow key={agent.id} agent={agent} index={idx} />
        ))}
      </div>
    </div>
  );
}

function AgentRow({ agent, index }: { agent: AgentRun; index: number }) {
  const icon = AGENT_ICONS[agent.id] ?? '🤖';

  return (
    <div
      className="fade-in"
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto',
        alignItems: 'start',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-3) var(--sp-4)',
        background: agent.status === 'RUNNING' ? 'rgba(59,130,246,0.05)' : 'var(--surface-2)',
        border: `1px solid ${agent.status === 'RUNNING' ? 'rgba(59,130,246,0.25)' : 'var(--border-2)'}`,
        borderRadius: 'var(--radius)',
        animationDelay: `${index * 60}ms`,
      }}
    >
      {/* Icon / spinner */}
      <div style={{
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface)',
        borderRadius: 8,
        fontSize: 18,
        flexShrink: 0,
      }}>
        {agent.status === 'RUNNING' ? <span className="spinner" /> : icon}
      </div>

      {/* Name + description + finding */}
      <div className="stack gap-1">
        <span style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agent.description}</span>
        {agent.finding && agent.status === 'COMPLETE' && (
          <div style={{
            marginTop: 4,
            fontSize: 12,
            color: 'var(--text)',
            background: 'var(--surface)',
            border: '1px solid var(--border-2)',
            borderRadius: 4,
            padding: '4px 8px',
            fontFamily: 'var(--mono)',
          }}>
            {agent.finding}
          </div>
        )}
      </div>

      {/* Status + elapsed */}
      <div className="stack gap-1" style={{ alignItems: 'flex-end', flexShrink: 0 }}>
        <AgentStatusBadge status={agent.status} />
        {agent.elapsedMs !== undefined && agent.status === 'COMPLETE' && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {(agent.elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  );
}
