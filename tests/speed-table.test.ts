import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, settle, startChrono } from './harness/chrono';
import { openSavedPage, type PageOptions } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

/** Opens a watch page 250 s into a 1000 s video and expands the Panel's details. */
async function openSpeedTable(options?: PageOptions) {
  const page = openSavedPage('watch-delhi', WATCH_URL, options);
  page.video.load({ duration: 1000 });
  page.video.seek(250);
  await startChrono();
  const panel = queryPanel()!;
  fireEvent.click(panel.getByRole('button', { name: 'Details' }));
  const table = within(panel.getByRole('group', { name: 'Speed table' }));
  /** The table's rows as a screen reader announces them, top to bottom. */
  const rows = () => table.getAllByRole('button').map((row) => row.getAttribute('aria-label'));
  return { page, panel, table, rows };
}

describe('Speed table', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it('shows the remaining and finish time at each common speed', async () => {
    const { rows } = await openSpeedTable();

    // 750 s of content left: 750 s, 600 s, 500 s, 428.6 s and 375 s of watch time.
    expect(rows()).toEqual([
      '1×: 12:30 left, ends 3:12 PM',
      '1.25×: 10:00 left, ends 3:10 PM',
      '1.5×: 8:20 left, ends 3:08 PM',
      '1.75×: 7:09 left, ends 3:07 PM',
      '2×: 6:15 left, ends 3:06 PM',
    ]);
  });

  it("adds a row in its place for a custom speed from YouTube's slider", async () => {
    const { page, rows } = await openSpeedTable();

    page.player.setSpeed(1.65);

    // 750 s of content at 1.65× takes 454.5 s.
    expect(rows()).toEqual([
      '1×: 12:30 left, ends 3:12 PM',
      '1.25×: 10:00 left, ends 3:10 PM',
      '1.5×: 8:20 left, ends 3:08 PM',
      '1.65×: 7:35 left, ends 3:07 PM',
      '1.75×: 7:09 left, ends 3:07 PM',
      '2×: 6:15 left, ends 3:06 PM',
    ]);
  });

  it('adds a row for a custom speed slower than any common speed', async () => {
    const { page, rows } = await openSpeedTable();

    page.player.setSpeed(0.5);

    expect(rows()).toEqual([
      '0.5×: 25:00 left, ends 3:25 PM',
      '1×: 12:30 left, ends 3:12 PM',
      '1.25×: 10:00 left, ends 3:10 PM',
      '1.5×: 8:20 left, ends 3:08 PM',
      '1.75×: 7:09 left, ends 3:07 PM',
      '2×: 6:15 left, ends 3:06 PM',
    ]);
  });

  it('drops the custom row when the speed goes back to a common one', async () => {
    const { page, rows } = await openSpeedTable();
    page.player.setSpeed(1.65);

    page.player.setSpeed(1.5);

    expect(rows()).toHaveLength(5);
    expect(rows()).not.toContain(expect.stringMatching(/^1\.65×/));
  });

  describe('highlights the current speed', () => {
    /** The rows highlighted as the current speed. */
    const highlighted = (table: Awaited<ReturnType<typeof openSpeedTable>>['table']) =>
      table.getAllByRole('button', { pressed: true }).map((row) => row.getAttribute('aria-label'));

    it('at 1× to begin with', async () => {
      const { table } = await openSpeedTable();

      expect(highlighted(table)).toEqual(['1×: 12:30 left, ends 3:12 PM']);
    });

    it("when the viewer changes speed in YouTube's menu", async () => {
      const { page, table } = await openSpeedTable();

      page.player.setSpeed(1.75);

      expect(highlighted(table)).toEqual(['1.75×: 7:09 left, ends 3:07 PM']);
    });

    it("when the viewer changes speed with Chrono's + button", async () => {
      const { panel, table } = await openSpeedTable();

      fireEvent.click(panel.getByRole('button', { name: 'Faster' }));

      expect(highlighted(table)).toEqual(['1.25×: 10:00 left, ends 3:10 PM']);
    });

    it('on a custom speed', async () => {
      const { page, table } = await openSpeedTable();

      page.player.setSpeed(1.65);

      expect(highlighted(table)).toEqual(['1.65×: 7:35 left, ends 3:07 PM']);
    });
  });

  it("applies a row's speed through YouTube's player when the viewer clicks it", async () => {
    const { page, panel, table } = await openSpeedTable();

    fireEvent.click(table.getByRole('button', { name: /^1\.5×/ }));

    expect(page.player.speed).toBe(1.5);
    panel.getByText('8:20 left at 1.5×');
    table.getByRole('button', { name: /^1\.5×/, pressed: true });
  });

  it("doesn't collapse the Panel's details when a row is clicked", async () => {
    const { panel, table } = await openSpeedTable();

    fireEvent.click(table.getByRole('button', { name: /^2×/ }));

    panel.getByRole('region', { name: 'Details' });
  });

  it("shows the times but can't apply a speed while YouTube's player speed API isn't recognised", async () => {
    const { page, table } = await openSpeedTable({ playerApi: false });

    const row = table.getByRole('button', { name: '1.5×: 8:20 left, ends 3:08 PM' }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);

    page.player.addApi();
    page.video.setSpeed(1);
    expect(row.disabled).toBe(false);
  });

  it('lets the keyboard reach every row, and keeps focus on a row as its times change', async () => {
    const { page, panel, table } = await openSpeedTable();
    const rows = table.getAllByRole('button');
    for (const row of rows) expect(row.tabIndex).toBe(0);
    const row = table.getByRole('button', { name: /^1\.25×/ });
    row.focus();

    // A browser fires click when Enter or Space activates a focused button.
    fireEvent.click(row);
    page.video.play();
    vi.advanceTimersByTime(2000);

    expect(page.player.speed).toBe(1.25);
    expect(panel.element.shadowRoot!.activeElement).toBe(row);
  });

  it('keeps focus on a row when a custom speed joins or leaves the table', async () => {
    const { page, panel, table } = await openSpeedTable();
    const row = table.getByRole('button', { name: /^1\.5×/ });
    row.focus();

    page.player.setSpeed(1.65);
    expect(panel.element.shadowRoot!.activeElement).toBe(row);

    fireEvent.click(row);
    expect(page.player.speed).toBe(1.5);
    expect(panel.element.shadowRoot!.activeElement).toBe(row);
  });

  it("treats a speed that's a common one but for floating-point noise as that common speed", async () => {
    const { page, rows, table } = await openSpeedTable();

    page.player.setSpeed(1.25 + 2e-16);

    expect(rows()).toHaveLength(5);
    table.getByRole('button', { name: /^1\.25×/, pressed: true });
  });

  it("writes finish times in the viewer's clock format", async () => {
    const { panel, rows } = await openSpeedTable();

    fireEvent.click(panel.getByRole('button', { name: 'More actions' }));
    fireEvent.click(panel.getByRole('menuitemradio', { name: '24-hour' }));
    await settle();

    expect(rows()[0]).toBe('1×: 12:30 left, ends 15:12');
  });
});
