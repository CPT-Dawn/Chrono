import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, settle, startChrono, stopChrono } from './harness/chrono';
import { finishNavigation, openSavedPage, type SavedPage, startNavigation } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

type TargetName = 'Video target' | 'Chapter target' | 'Playlist target';

/** Opens a watch page 250 s into a 1000 s video and expands the Panel's details. */
async function openVideo() {
  const page = openSavedPage('watch-delhi', WATCH_URL);
  page.video.load({ duration: 1000 });
  page.video.seek(250);
  await startChrono();
  fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));
  return page;
}

/** A scope's target control as the viewer sees it, or null when the Panel shows none. */
function queryTarget(name: TargetName) {
  const element = queryPanel()?.queryByRole('group', { name });
  return element ? { element, ...within(element) } : null;
}

function target(name: TargetName) {
  const control = queryTarget(name);
  if (!control) throw new Error(`The Panel shows no ${name}`);
  return control;
}

/** Chooses the kind of target, as the viewer does from the Target list. */
function chooseKind(name: TargetName, kind: 'No target' | 'Done by' | 'I have'): void {
  const control = target(name);
  const option = control.getByRole('option', { name: kind }) as HTMLOptionElement;
  fireEvent.change(control.getByRole('combobox', { name: 'Target' }), { target: { value: option.value } });
}

/** Types `value` into one of a target's fields. */
function enter(name: TargetName, field: string, value: string): void {
  const input = target(name).getByRole('spinbutton', { name: field }) as HTMLInputElement;
  input.value = value;
  fireEvent.input(input);
}

/** Sets a watch time target: "I have `hours` h `minutes` min". */
function setWatchTime(name: TargetName, hours: number, minutes: number): void {
  chooseKind(name, 'I have');
  enter(name, 'Hours', String(hours));
  enter(name, 'Minutes', String(minutes));
}

/** Sets a finish-time target: "Done by `hour`:`minute` `period`" on a 12-hour clock. */
function setFinishTime(name: TargetName, hour: number, minute: number, period: 'AM' | 'PM'): void {
  chooseKind(name, 'Done by');
  const periodList = target(name).getByRole('combobox', { name: 'AM or PM' });
  const option = within(periodList).getByRole('option', { name: period }) as HTMLOptionElement;
  fireEvent.change(periodList, { target: { value: option.value } });
  fireEvent.input(periodList);
  enter(name, 'Hour', String(hour));
  enter(name, 'Minute', String(minute).padStart(2, '0'));
}

/** The kind of target the Target list shows. */
function kindOf(name: TargetName): string | null | undefined {
  const list = target(name).getByRole('combobox', { name: 'Target' }) as HTMLSelectElement;
  return list.selectedOptions[0]?.textContent;
}

/** What the viewer reads in each of a target's visible fields, by field name. */
function fieldValues(name: TargetName): Record<string, string> {
  const control = target(name);
  const fields = [...control.queryAllByRole('spinbutton'), ...control.queryAllByRole('combobox')].filter(
    (field) => field.getAttribute('aria-label') !== null,
  );
  return Object.fromEntries(
    fields.map((field) => [
      field.getAttribute('aria-label'),
      field instanceof HTMLSelectElement ? field.selectedOptions[0]?.textContent : (field as HTMLInputElement).value,
    ]),
  );
}

/** YouTube moves to the video at `url` without a reload, and loads it. */
async function navigateToVideo(
  page: SavedPage,
  url: string,
  { duration, position }: { duration: number; position: number } = { duration: 1000, position: 250 },
): Promise<void> {
  await startNavigation(url);
  page.video.startLoading();
  page.video.load({ duration });
  page.video.seek(position);
  await finishNavigation();
}

/** Chooses a Clock format from the Panel's ⋮ menu. */
function chooseClockFormat(format: '12-hour' | '24-hour'): void {
  const panel = queryPanel()!;
  fireEvent.click(panel.getByRole('button', { name: 'More actions' }));
  fireEvent.click(panel.getByRole('menuitemradio', { name: format }));
}

describe('Targets', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  describe('on the Video scope', () => {
    it('shows the speed that fits the rest of the video into the watch time the viewer has', async () => {
      await openVideo();

      // 750 s of content into 10 minutes.
      setWatchTime('Video target', 0, 10);

      target('Video target').getByText('Needs 1.25×');
      target('Video target').getByRole('button', { name: 'Apply 1.25×' });
    });

    it('shows the speed that finishes the video by the time the viewer chooses', async () => {
      await openVideo();

      // 750 s of content by 3:10 PM, 10 minutes from now.
      setFinishTime('Video target', 3, 10, 'PM');

      target('Video target').getByText('Needs 1.25×');
    });

    it("applies the required speed, rounded to 0.05×, through YouTube's player", async () => {
      const page = await openVideo();
      // 750 s of content into 11 minutes needs 1.136×.
      setWatchTime('Video target', 0, 11);

      fireEvent.click(target('Video target').getByRole('button', { name: 'Apply 1.15×' }));

      expect(page.player.speed).toBe(1.15);
      // Close to the 11 minutes the viewer has.
      queryPanel()!.getByText('10:53 left at 1.15×');
    });

    it('meets a finish time once applied', async () => {
      const page = await openVideo();
      setFinishTime('Video target', 3, 10, 'PM');

      fireEvent.click(target('Video target').getByRole('button', { name: 'Apply 1.25×' }));

      expect(page.player.speed).toBe(1.25);
      // 600 s from 3:00 PM.
      queryPanel()!.getByText('10:00 left at 1.25×');
    });

    it("explains a required speed beyond YouTube's 2× limit, with nothing to apply", async () => {
      await openVideo();

      // 750 s of content into 5 minutes.
      setWatchTime('Video target', 0, 5);

      target('Video target').getByText("Needs 2.5× · beyond YouTube's 2× limit");
      expect(target('Video target').queryByRole('button', { name: /Apply/ })).toBeNull();
    });

    it("explains a required speed below YouTube's 0.25× limit, with nothing to apply", async () => {
      await openVideo();

      // 750 s of content into an hour.
      setWatchTime('Video target', 1, 0);

      target('Video target').getByText("Slower than YouTube's 0.25× limit");
      expect(target('Video target').queryByRole('button', { name: /Apply/ })).toBeNull();
    });

    it('applies a required speed that rounds to 2×', async () => {
      const page = await openVideo();
      // 750 s of content into 6 minutes needs 2.083×.
      setWatchTime('Video target', 0, 6);
      target('Video target').getByText("Needs 2.1× · beyond YouTube's 2× limit");

      // 727 s of content into 6 minutes needs 2.019×.
      page.video.seek(273);

      target('Video target').getByText('Needs 2×');
      fireEvent.click(target('Video target').getByRole('button', { name: 'Apply 2×' }));
      expect(page.player.speed).toBe(2);
    });

    it('says when the finish time has already passed', async () => {
      await openVideo();

      setFinishTime('Video target', 2, 50, 'PM');

      target('Video target').getByText('That time has already passed');
      expect(target('Video target').queryByRole('button', { name: /Apply/ })).toBeNull();
    });

    it('says so once the clock passes the finish time', async () => {
      await openVideo();
      setFinishTime('Video target', 3, 10, 'PM');

      vi.advanceTimersByTime(11 * 60_000);

      target('Video target').getByText('That time has already passed');
      expect(target('Video target').queryByRole('button', { name: /Apply/ })).toBeNull();
    });

    it('asks for more than no watch time at all', async () => {
      await openVideo();

      setWatchTime('Video target', 0, 0);

      target('Video target').getByText('Choose a watch time above zero');
      expect(target('Video target').queryByRole('button', { name: /Apply/ })).toBeNull();
    });

    it('takes a finish time after midnight as tomorrow', async () => {
      vi.setSystemTime(new Date(2026, 9, 17, 23, 50, 0));
      await openVideo();

      // 750 s of content by 12:00 AM, 10 minutes from now.
      setFinishTime('Video target', 12, 0, 'AM');

      target('Video target').getByText('Needs 1.25×');
    });

    it('takes a clock time more than an hour ago as tomorrow', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      // A 13-hour video, 200 s in: 46,800 s of content left.
      page.video.load({ duration: 47_000 });
      page.video.seek(200);
      await startChrono();
      fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

      // 4:00 AM tomorrow, 13 hours from now.
      setFinishTime('Video target', 4, 0, 'AM');

      target('Video target').getByText('Needs 1×');
    });

    it('takes a clock time within the last hour as one that has passed', async () => {
      await openVideo();

      setFinishTime('Video target', 2, 1, 'PM');

      target('Video target').getByText('That time has already passed');
    });

    it('starts from the current finish time or remaining, so the required speed starts at the current speed', async () => {
      await openVideo();

      chooseKind('Video target', 'I have');
      expect(fieldValues('Video target')).toEqual({ Hours: '0', Minutes: '13' });

      chooseKind('Video target', 'Done by');
      expect(fieldValues('Video target')).toEqual({ Hour: '3', Minute: '13', 'AM or PM': 'PM' });
    });

    it('clears when the viewer chooses No target', async () => {
      await openVideo();
      setWatchTime('Video target', 0, 10);

      chooseKind('Video target', 'No target');

      expect(target('Video target').queryByText(/Needs/)).toBeNull();
    });

    it('clears when YouTube moves to another video', async () => {
      const page = await openVideo();
      setWatchTime('Video target', 0, 10);

      await navigateToVideo(page, 'https://www.youtube.com/watch?v=aircAruvnKk');

      expect(kindOf('Video target')).toBe('No target');
      expect(target('Video target').queryByText(/Needs/)).toBeNull();
    });

    it('is not kept when the viewer reloads the page', async () => {
      await openVideo();
      setWatchTime('Video target', 0, 10);

      stopChrono();
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();

      // The details stay expanded, as the viewer left them.
      expect(kindOf('Video target')).toBe('No target');
      expect(target('Video target').queryByText(/Needs/)).toBeNull();
    });
  });

  describe('on the Chapter scope', () => {
    // 3Blue1Brown's "But what is a neural network?", 18:40 long. 4:10 in, "Introducing
    // layers" has 81 s left.
    const CHAPTERS_URL = 'https://www.youtube.com/watch?v=aircAruvnKk';

    async function openChapters() {
      const page = openSavedPage('watch-chapters-delhi', CHAPTERS_URL);
      page.video.load({ duration: 1120 });
      page.video.seek(250);
      await startChrono();
      fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));
      return page;
    }

    it("shows the speed that fits the rest of the chapter into the viewer's watch time", async () => {
      await openChapters();

      setWatchTime('Chapter target', 0, 1);

      // 81 s of content into a minute.
      target('Chapter target').getByText('Needs 1.35×');
      within(queryPanel()!.getByRole('group', { name: 'Chapter' })).getByRole('group', { name: 'Chapter target' });
    });

    it('shows the speed that finishes the chapter by the time the viewer chooses', async () => {
      await openChapters();

      setFinishTime('Chapter target', 3, 1, 'PM');

      target('Chapter target').getByText('Needs 1.35×');
    });

    it('applies the required speed', async () => {
      const page = await openChapters();
      setWatchTime('Chapter target', 0, 1);

      fireEvent.click(target('Chapter target').getByRole('button', { name: 'Apply 1.35×' }));

      expect(page.player.speed).toBe(1.35);
    });

    it('clears when YouTube moves to another video', async () => {
      const page = await openChapters();
      setWatchTime('Chapter target', 0, 1);

      // To a video without chapters and back.
      await navigateToVideo(page, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
      await navigateToVideo(page, CHAPTERS_URL, { duration: 1120, position: 250 });

      expect(kindOf('Chapter target')).toBe('No target');
    });
  });

  describe('on the Playlist scope', () => {
    const SETTLERS = 'PLa1F2ddGya_8Pn07ZxzgxFRw5iQbovXZv';
    // The second of the eight "Settlers" videos, 15:27 long. 427 s in, the playlist has
    // 12,539 s of content left.
    const SETTLERS_2 = `https://www.youtube.com/watch?v=cDli6QjNna0&list=${SETTLERS}`;
    const SETTLERS_3 = `https://www.youtube.com/watch?v=AynMJ5CkGEQ&list=${SETTLERS}&index=3`;

    async function openPlaylist() {
      const page = openSavedPage('watch-playlist', SETTLERS_2);
      page.video.load({ duration: 927 });
      page.video.seek(427);
      await startChrono();
      fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));
      return page;
    }

    it("shows the speed that fits the rest of the playlist into the viewer's watch time", async () => {
      await openPlaylist();

      setWatchTime('Playlist target', 2, 0);

      // 12,539 s of content into 2 hours needs 1.74×.
      target('Playlist target').getByText('Needs 1.75×');
      within(queryPanel()!.getByRole('group', { name: 'Playlist' })).getByRole('group', { name: 'Playlist target' });
    });

    it('shows the speed that finishes the playlist by the time the viewer chooses', async () => {
      await openPlaylist();

      setFinishTime('Playlist target', 5, 0, 'PM');

      target('Playlist target').getByText('Needs 1.75×');
    });

    it('counts only up to the target entry', async () => {
      await openPlaylist();
      const entry = queryPanel()!.getByRole('spinbutton', { name: 'Up to video' }) as HTMLInputElement;
      entry.value = '4';
      fireEvent.change(entry);

      setWatchTime('Playlist target', 0, 50);

      // 4,145 s of content into 50 minutes needs 1.38×.
      target('Playlist target').getByText('Needs 1.4×');
    });

    it('applies the required speed', async () => {
      const page = await openPlaylist();
      setWatchTime('Playlist target', 2, 0);

      fireEvent.click(target('Playlist target').getByRole('button', { name: 'Apply 1.75×' }));

      expect(page.player.speed).toBe(1.75);
    });

    it('stays when YouTube plays the next video in the same playlist', async () => {
      const page = await openPlaylist();
      setWatchTime('Playlist target', 2, 0);
      setWatchTime('Video target', 0, 5);

      await startNavigation(SETTLERS_3);
      page.selectPlaylistEntry(3);
      page.video.startLoading();
      page.video.load({ duration: 1928 });
      page.video.seek(928);
      await finishNavigation();

      expect(fieldValues('Playlist target')).toEqual({ Hours: '2', Minutes: '0' });
      // 1,000 s left of video 3, then 10,111 s in videos 4–8: 11,111 s into 2 hours.
      target('Playlist target').getByText('Needs 1.55×');
      // The Video target was for the previous video.
      expect(kindOf('Video target')).toBe('No target');
    });

    it('clears when the viewer leaves the playlist', async () => {
      const page = await openPlaylist();
      setWatchTime('Playlist target', 2, 0);

      await navigateToVideo(page, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
      await navigateToVideo(page, SETTLERS_2, { duration: 927, position: 427 });

      expect(kindOf('Playlist target')).toBe('No target');
    });
  });

  describe('inputs', () => {
    it('can all be reached and changed with the keyboard', async () => {
      await openVideo();
      chooseKind('Video target', 'Done by');
      const control = target('Video target');

      const fields = [
        control.getByRole('combobox', { name: 'Target' }),
        control.getByRole('spinbutton', { name: 'Hour' }),
        control.getByRole('spinbutton', { name: 'Minute' }),
        control.getByRole('combobox', { name: 'AM or PM' }),
      ];
      // Native form controls, which browsers let the keyboard focus and change.
      for (const field of fields) {
        expect(['SELECT', 'INPUT']).toContain(field.tagName);
        expect(field.tabIndex).toBe(0);
        expect((field as HTMLInputElement).disabled).toBe(false);
      }
    });

    it('offer AM and PM on a 12-hour clock', async () => {
      await openVideo();
      chooseKind('Video target', 'Done by');

      const period = target('Video target').getByRole('combobox', { name: 'AM or PM' });
      expect(within(period).getAllByRole('option').map((option) => option.textContent)).toEqual(['AM', 'PM']);
      expect(target('Video target').getByRole('spinbutton', { name: 'Hour' })).toHaveProperty('max', '12');
    });

    it('take a 24-hour time when the viewer chooses 24-hour', async () => {
      await openVideo();
      setFinishTime('Video target', 3, 10, 'PM');

      chooseClockFormat('24-hour');
      await settle();

      expect(target('Video target').queryByRole('combobox', { name: 'AM or PM' })).toBeNull();
      expect(fieldValues('Video target')).toEqual({ Hour: '15', Minute: '10' });
      expect(target('Video target').getByRole('spinbutton', { name: 'Hour' })).toHaveProperty('max', '23');
      enter('Video target', 'Hour', '15');
      enter('Video target', 'Minute', '05');
      // 750 s of content by 15:05, 5 minutes from now.
      target('Video target').getByText("Needs 2.5× · beyond YouTube's 2× limit");
    });

    it('write the hour the way the Panel writes it on a 24-hour clock', async () => {
      vi.setSystemTime(new Date(2026, 9, 17, 7, 0, 0));
      await openVideo();
      chooseClockFormat('24-hour');
      await settle();

      chooseKind('Video target', 'Done by');

      // The video ends at 07:12:30.
      expect(queryPanel()!.getAllByText('ends 07:12').length).toBeGreaterThan(0);
      expect(fieldValues('Video target')).toEqual({ Hour: '07', Minute: '13' });
    });

    it("follow a 24-hour locale's convention on Automatic", async () => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
      await openVideo();

      chooseKind('Video target', 'Done by');

      expect(target('Video target').queryByRole('combobox', { name: 'AM or PM' })).toBeNull();
      expect(fieldValues('Video target')).toEqual({ Hour: '15', Minute: '13' });
    });
  });
});
