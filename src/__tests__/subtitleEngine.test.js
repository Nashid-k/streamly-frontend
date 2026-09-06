import { describe, it, expect, beforeEach } from 'vitest';
import { SubtitleEngine } from '../utils/subtitleEngine';

describe('SubtitleEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new SubtitleEngine();
  });

  describe('parseSRT', () => {
    it('parses valid SRT content', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,000 --> 00:00:08,000
Second subtitle`;
      const cues = SubtitleEngine.parseSRT(srt);
      expect(cues).toHaveLength(2);
      expect(cues[0].start).toBe(1);
      expect(cues[0].end).toBe(4);
      expect(cues[0].text).toBe('Hello, world!');
      expect(cues[1].start).toBe(5);
      expect(cues[1].end).toBe(8);
    });

    it('handles hours correctly', () => {
      const srt = `1
01:30:00,500 --> 02:00:00,000
Long subtitle`;
      const cues = SubtitleEngine.parseSRT(srt);
      expect(cues[0].start).toBe(5400.5);
      expect(cues[0].end).toBe(7200);
    });

    it('strips HTML tags from subtitle text', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
<b>Bold</b> and <i>italic</i>`;
      const cues = SubtitleEngine.parseSRT(srt);
      expect(cues[0].text).toBe('Bold and italic');
    });

    it('returns empty array for invalid SRT', () => {
      expect(SubtitleEngine.parseSRT('')).toEqual([]);
      expect(SubtitleEngine.parseSRT('not a subtitle file')).toEqual([]);
    });

    it('handles multiline subtitle text', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two`;
      const cues = SubtitleEngine.parseSRT(srt);
      expect(cues[0].text).toBe('Line one\nLine two');
    });

    it('preserves block order from SRT', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
First

2
00:00:05,000 --> 00:00:08,000
Second`;
      const cues = SubtitleEngine.parseSRT(srt);
      expect(cues[0].start).toBe(1);
      expect(cues[1].start).toBe(5);
    });
  });

  describe('parseVTT', () => {
    it('parses valid VTT content', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello, world!

00:00:05.000 --> 00:00:08.000
Second subtitle`;
      const cues = SubtitleEngine.parseVTT(vtt);
      expect(cues).toHaveLength(2);
      expect(cues[0].start).toBe(1);
      expect(cues[0].end).toBe(4);
    });

    it('handles hours in VTT', () => {
      const vtt = `WEBVTT

01:30:00.500 --> 02:00:00.000
Long subtitle`;
      const cues = SubtitleEngine.parseVTT(vtt);
      expect(cues[0].start).toBe(5400.5);
      expect(cues[0].end).toBe(7200);
    });

    it('strips HTML tags', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<b>Bold</b> text`;
      const cues = SubtitleEngine.parseVTT(vtt);
      expect(cues[0].text).toBe('Bold text');
    });

    it('returns empty array for invalid VTT', () => {
      expect(SubtitleEngine.parseVTT('')).toEqual([]);
    });
  });

  describe('getActiveCue', () => {
    beforeEach(() => {
      engine.setCues([
        { start: 1, end: 4, text: 'First' },
        { start: 5, end: 8, text: 'Second' },
        { start: 10, end: 15, text: 'Third' },
      ]);
    });

    it('returns null for empty cues', () => {
      const empty = new SubtitleEngine();
      expect(empty.getActiveCue(1)).toBeNull();
    });

    it('returns the correct cue for a given time', () => {
      const cue = engine.getActiveCue(2);
      expect(cue.text).toBe('First');
    });

    it('returns null when no cue matches', () => {
      expect(engine.getActiveCue(9)).toBeNull();
    });

    it('returns the same cue for consecutive calls (fast path)', () => {
      const cue1 = engine.getActiveCue(2);
      const cue2 = engine.getActiveCue(3);
      expect(cue1).toBe(cue2); // Same object reference
    });

    it('returns null when time is before first cue', () => {
      expect(engine.getActiveCue(0)).toBeNull();
    });

    it('returns null when time is after last cue', () => {
      expect(engine.getActiveCue(20)).toBeNull();
    });

    it('handles exact start boundary', () => {
      const cue = engine.getActiveCue(5);
      expect(cue.text).toBe('Second');
    });

    it('handles exact end boundary', () => {
      const cue = engine.getActiveCue(8);
      expect(cue.text).toBe('Second');
    });

    it('returns null between cues (gap)', () => {
      expect(engine.getActiveCue(9)).toBeNull(); // Between Second (5-8) and Third (10-15)
    });

    it('handles time exactly at 0', () => {
      expect(engine.getActiveCue(0)).toBeNull();
    });

    it('handles negative time', () => {
      expect(engine.getActiveCue(-1)).toBeNull();
    });

    it('handles very large time', () => {
      expect(engine.getActiveCue(999999)).toBeNull();
    });

    it('handles floating point time', () => {
      const cue = engine.getActiveCue(2.5);
      expect(cue.text).toBe('First');
    });

    it('handles cues with zero duration', () => {
      engine.setCues([{ start: 5, end: 5, text: 'Zero' }]);
      // start=5, end=5: time=5 satisfies 5>=5 && 5<=5, so cue is active
      const cue = engine.getActiveCue(5);
      expect(cue).not.toBeNull();
    });

    it('uses binary search for cue lookup', () => {
      // With many cues, binary search should still work
      const manyCues = Array.from({ length: 100 }, (_, i) => ({
        start: i * 2,
        end: i * 2 + 1.5,
        text: `Cue ${i}`,
      }));
      engine.setCues(manyCues);
      const cue = engine.getActiveCue(50);
      expect(cue.text).toBe('Cue 25');
    });
  });

  describe('setCues', () => {
    it('sorts cues by start time', () => {
      engine.setCues([
        { start: 10, end: 15, text: 'Later' },
        { start: 1, end: 5, text: 'Earlier' },
      ]);
      expect(engine.cues[0].start).toBe(1);
      expect(engine.cues[1].start).toBe(10);
    });

    it('resets active cue', () => {
      engine.setCues([{ start: 1, end: 5, text: 'Test' }]);
      engine.getActiveCue(3);
      expect(engine.activeCue).not.toBeNull();
      engine.setCues([]);
      expect(engine.activeCue).toBeNull();
    });
  });
});
