'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getStats, Stats, Status } from '@/lib/api';

const numberFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
});

export const formatCount = (n: number): string => {
  if (isNaN(n) || n === null || n === undefined) return '0';
  return numberFormatter.format(n);
};

export const formatAmount = (n: number): string => {
  if (isNaN(n) || n === null || n === undefined) return '0';
  return numberFormatter.format(n);
};

export const formatCompletionRate = (completed: number, total: number): string => {
  if (!total || isNaN(total) || total <= 0 || isNaN(completed) || completed <= 0) {
    return '0%';
  }
  return percentFormatter.format(completed / total);
};

const ALL_STATUSES: Status[] = ['Created', 'Funded', 'Completed', 'Disputed', 'Resolved', 'Cancelled'];

interface StatsStripProps {
  refreshTrigger?: number;
}

export function StatsStrip({ refreshTrigger }: StatsStripProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStats();
      if (!data || typeof data.contracts !== 'number') {
        throw new Error('Invalid stats payload received');
      }
      setStats(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to load protocol stats');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats, refreshTrigger]);

  const totalContracts = stats?.contracts ?? 0;
  const totalEscrowed = stats?.totalEscrowed ?? 0;
  const totalReleased = stats?.totalReleased ?? 0;
  const inEscrow = Math.max(0, totalEscrowed - totalReleased);
  const completedCount = (stats?.byStatus?.Completed ?? 0) + (stats?.byStatus?.Resolved ?? 0);
  const completionRate = formatCompletionRate(completedCount, totalContracts);

  // Status breakdown calculations
  const segments = ALL_STATUSES.map((status) => {
    const count = stats?.byStatus?.[status] ?? 0;
    const percentage = totalContracts > 0 ? Math.round((count / totalContracts) * 100) : 0;
    return { status, count, percentage };
  });

  const activeSegments = segments.filter((s) => s.count > 0);
  const ariaSummary = segments.map((s) => `${s.status}: ${s.count}`).join(', ');

  return (
    <section className="stats-strip" aria-label="Protocol statistics">
      {/* 4 KPI Tiles Grid */}
      <div className="stats-grid" role="region" aria-label="Key Performance Indicators">
        <div className="card stats-tile" data-testid="kpi-escrows">
          <span className="stats-tile-title muted small">Escrows</span>
          <div className="stats-tile-value">
            {loading ? (
              <span className="stats-skeleton" aria-hidden="true" />
            ) : error ? (
              <span className="stats-error-placeholder">—</span>
            ) : (
              formatCount(totalContracts)
            )}
          </div>
        </div>

        <div className="card stats-tile" data-testid="kpi-in-escrow">
          <span className="stats-tile-title muted small">In escrow</span>
          <div className="stats-tile-value">
            {loading ? (
              <span className="stats-skeleton" aria-hidden="true" />
            ) : error ? (
              <span className="stats-error-placeholder">—</span>
            ) : (
              formatAmount(inEscrow)
            )}
          </div>
        </div>

        <div className="card stats-tile" data-testid="kpi-released">
          <span className="stats-tile-title muted small">Released</span>
          <div className="stats-tile-value">
            {loading ? (
              <span className="stats-skeleton" aria-hidden="true" />
            ) : error ? (
              <span className="stats-error-placeholder">—</span>
            ) : (
              formatAmount(totalReleased)
            )}
          </div>
        </div>

        <div className="card stats-tile" data-testid="kpi-completion-rate">
          <span className="stats-tile-title muted small">Completion rate</span>
          <div className="stats-tile-value">
            {loading ? (
              <span className="stats-skeleton" aria-hidden="true" />
            ) : error ? (
              <span className="stats-error-placeholder">—</span>
            ) : (
              completionRate
            )}
          </div>
        </div>
      </div>

      {/* Error state with retry link */}
      {error && (
        <div className="stats-error-bar small muted" role="status">
          <span>Failed to load live statistics ({error}).</span>{' '}
          <button
            type="button"
            className="stats-retry-btn btn-link"
            onClick={fetchStats}
            aria-label="Retry loading protocol statistics"
          >
            Retry
          </button>
        </div>
      )}

      {/* Zero-state copy */}
      {!loading && !error && totalContracts === 0 && (
        <div className="card stats-zero-state muted small" data-testid="stats-zero-state">
          No escrows recorded yet. Create an escrow below to begin seeing live protocol activity.
        </div>
      )}

      {/* Stacked Breakdown Bar & Legend */}
      {!loading && !error && totalContracts > 0 && (
        <div className="card stats-breakdown-card" data-testid="stats-breakdown">
          <div className="stats-breakdown-header row" style={{ justifyContent: 'space-between' }}>
            <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Status breakdown</h4>
            <span className="small muted">{formatCount(totalContracts)} total</span>
          </div>

          <div
            className="stats-breakdown-bar"
            role="img"
            aria-label={`Status breakdown: ${ariaSummary}`}
          >
            {activeSegments.map((seg) => (
              <div
                key={seg.status}
                className={`stats-bar-segment badge-${seg.status}`}
                style={{ width: `${seg.percentage}%` }}
                title={`${seg.status}: ${seg.count} (${seg.percentage}%)`}
              >
                {seg.percentage >= 10 && (
                  <span className="stats-bar-label">{seg.status}</span>
                )}
              </div>
            ))}
          </div>

          <div className="stats-legend" role="list" aria-label="Filter escrows by status">
            {segments.map((seg) => (
              <Link
                key={seg.status}
                href={`/contracts?status=${seg.status}`}
                className="stats-legend-item"
                role="listitem"
                aria-label={`Filter by ${seg.status} (${seg.count})`}
              >
                <span className={`stats-legend-dot badge-${seg.status}`} aria-hidden="true" />
                <span className="stats-legend-name">{seg.status}</span>
                <span className="stats-legend-count mono">({seg.count})</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
