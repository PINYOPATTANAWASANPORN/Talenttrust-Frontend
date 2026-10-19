import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatAmount,
  formatCompletionRate,
  formatCount,
  StatsStrip,
} from '@/components/escrow/StatsStrip';
import * as apiModule from '@/lib/api';

const mockStats: apiModule.Stats = {
  contracts: 125,
  byStatus: {
    Created: 15,
    Funded: 40,
    Completed: 50,
    Disputed: 5,
    Resolved: 10,
    Cancelled: 5,
  },
  totalEscrowed: 2500000,
  totalReleased: 1750000,
};

describe('StatsStrip Unit & Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Formatting helpers', () => {
    it('formats large numbers and zero correctly', () => {
      expect(formatCount(0)).toBe('0');
      expect(formatCount(1234567)).toBe('1,234,567');
      expect(formatAmount(0)).toBe('0');
      expect(formatAmount(9876543210)).toBe('9,876,543,210');
    });

    it('calculates and formats completion rate without NaN when contracts is zero', () => {
      expect(formatCompletionRate(0, 0)).toBe('0%');
      expect(formatCompletionRate(10, 0)).toBe('0%');
      expect(formatCompletionRate(0, 10)).toBe('0%');
      expect(formatCompletionRate(25, 100)).toBe('25%');
      expect(formatCompletionRate(1, 3)).toBe('33%');
    });
  });

  describe('StatsStrip component rendering', () => {
    it('renders loading skeleton then populates 4 KPI tiles and breakdown bar', async () => {
      vi.spyOn(apiModule, 'getStats').mockResolvedValueOnce(mockStats);

      render(<StatsStrip />);

      // Initially renders skeleton placeholders
      expect(screen.getByTestId('kpi-escrows')).toBeInTheDocument();

      // Waits for stats to load
      await waitFor(() => {
        expect(screen.getByText('125')).toBeInTheDocument();
      });

      // KPI values
      // In escrow = 2500000 - 1750000 = 750,000
      expect(screen.getByText('750,000')).toBeInTheDocument();
      // Released = 1,750,000
      expect(screen.getByText('1,750,000')).toBeInTheDocument();
      // Completion rate = (50 Completed + 10 Resolved) / 125 = 60 / 125 = 48%
      expect(screen.getByText('48%')).toBeInTheDocument();

      // Breakdown bar accessibility
      const bar = screen.getByRole('img', { name: /Status breakdown:/i });
      expect(bar).toBeInTheDocument();
      expect(bar).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Funded: 40'),
      );
      expect(bar).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Completed: 50'),
      );

      // Legend links to filter routes
      const fundedLink = screen.getByRole('listitem', {
        name: /Filter by Funded \(40\)/i,
      });
      expect(fundedLink).toHaveAttribute('href', '/contracts?status=Funded');

      const completedLink = screen.getByRole('listitem', {
        name: /Filter by Completed \(50\)/i,
      });
      expect(completedLink).toHaveAttribute(
        'href',
        '/contracts?status=Completed',
      );
    });

    it('renders zero-state copy when contracts count is 0', async () => {
      vi.spyOn(apiModule, 'getStats').mockResolvedValueOnce({
        contracts: 0,
        byStatus: {
          Created: 0,
          Funded: 0,
          Completed: 0,
          Disputed: 0,
          Resolved: 0,
          Cancelled: 0,
        },
        totalEscrowed: 0,
        totalReleased: 0,
      });

      render(<StatsStrip />);

      await waitFor(() => {
        expect(screen.getByTestId('stats-zero-state')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/No escrows recorded yet/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('stats-breakdown')).not.toBeInTheDocument();
    });

    it('handles network error gracefully and allows retry without hiding layout', async () => {
      const getStatsMock = vi
        .spyOn(apiModule, 'getStats')
        .mockRejectedValueOnce(new Error('Network error 500'))
        .mockResolvedValueOnce(mockStats);

      render(<StatsStrip />);

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load live statistics/i),
        ).toBeInTheDocument();
      });

      // KPI tiles show placeholder '—'
      const placeholders = screen.getAllByText('—');
      expect(placeholders.length).toBe(4);

      // Click retry button
      const retryBtn = screen.getByRole('button', {
        name: /Retry loading protocol statistics/i,
      });
      await act(async () => {
        await userEvent.click(retryBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('125')).toBeInTheDocument();
      });
      expect(getStatsMock).toHaveBeenCalledTimes(2);
    });

    it('refreshes stats when refreshTrigger prop changes', async () => {
      const getStatsMock = vi
        .spyOn(apiModule, 'getStats')
        .mockResolvedValue(mockStats);

      const { rerender } = render(<StatsStrip refreshTrigger={0} />);

      await waitFor(() => {
        expect(screen.getByText('125')).toBeInTheDocument();
      });
      expect(getStatsMock).toHaveBeenCalledTimes(1);

      // Trigger action refresh
      rerender(<StatsStrip refreshTrigger={1} />);

      await waitFor(() => {
        expect(getStatsMock).toHaveBeenCalledTimes(2);
      });
    });
  });
});
