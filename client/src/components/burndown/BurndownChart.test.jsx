import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BurndownChart, { formatDayLabel } from './BurndownChart.jsx';

// US-15 (SCRUM-161).

const series = [
  { date: '2026-08-17', ideal: 8, actual: 8 },
  { date: '2026-08-18', ideal: 6, actual: 2 },
  { date: '2026-08-19', ideal: 4, actual: 2 },
  { date: '2026-08-20', ideal: 2, actual: null },
  { date: '2026-08-21', ideal: 0, actual: null }
];

function pointCount(line) {
  return line.getAttribute('points').trim().split(' ').length;
}

describe('formatDayLabel', () => {
  it('formats a date key as day and short month', () => {
    expect(formatDayLabel('2026-08-17')).toBe('17 Aug');
    expect(formatDayLabel('2026-12-01')).toBe('1 Dec');
  });
});

describe('BurndownChart', () => {
  it('labels the axes as Sprint time and remaining Story Points', () => {
    render(<BurndownChart series={series} totalPoints={8} />);

    expect(screen.getByText('Sprint day')).toBeInTheDocument();
    expect(screen.getByText('Remaining Story Points')).toBeInTheDocument();
    expect(screen.getByText('17 Aug')).toBeInTheDocument();
    expect(screen.getByText('21 Aug')).toBeInTheDocument();
  });

  it('draws the ideal line across every Sprint day', () => {
    render(<BurndownChart series={series} totalPoints={8} />);

    expect(pointCount(screen.getByTestId('burndown-ideal-line'))).toBe(5);
  });

  it('draws the actual line only up to today', () => {
    render(<BurndownChart series={series} totalPoints={8} />);

    expect(pointCount(screen.getByTestId('burndown-actual-line'))).toBe(3);
  });

  it('starts the ideal line at the top of the chart and ends it on the x axis', () => {
    render(<BurndownChart series={series} totalPoints={8} />);

    const points = screen
      .getByTestId('burndown-ideal-line')
      .getAttribute('points')
      .split(' ')
      .map((pair) => pair.split(',').map(Number));
    const [, firstY] = points[0];
    const [, lastY] = points[points.length - 1];
    expect(firstY).toBeLessThan(lastY);
  });

  it('omits the actual line when no day has happened yet', () => {
    const future = series.map((point) => ({ ...point, actual: null }));

    render(<BurndownChart series={future} totalPoints={8} />);

    expect(screen.queryByTestId('burndown-actual-line')).not.toBeInTheDocument();
  });

  it('shows a legend for both lines', () => {
    render(<BurndownChart series={series} totalPoints={8} />);

    expect(screen.getByText('Ideal burndown')).toBeInTheDocument();
    expect(screen.getByText('Actual remaining work')).toBeInTheDocument();
  });

  it('gives the chart an accessible description', () => {
    render(<BurndownChart series={series} totalPoints={8} />);

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Burndown chart over 5 Sprint days, starting at 8 Story Points'
    );
  });
});
