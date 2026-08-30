/**
 * ronr-data.test.js — the one behaviour ronr.data.js carries beyond plain
 * data: THRESHOLDS.chair() is a function, not a lookup table entry, and it is
 * meant to be unreachable through the normal vote path (chair rulings are
 * never vote-counted). legality.test.js and replay.test.js exercise the data
 * exhaustively as data; this file is the one line that is actual logic.
 */

import { describe, it, expect } from 'vitest';
import { THRESHOLDS } from '../src/ronr.data.js';

describe('THRESHOLDS.chair', () => {
  it('throws — chair rulings are recorded via record_chair_ruling, never tallied', () => {
    expect(() => THRESHOLDS.chair()).toThrow('chair rulings are not vote-counted; use record_chair_ruling');
  });
});
