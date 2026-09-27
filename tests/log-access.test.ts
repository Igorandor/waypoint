import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LogCapture, LogSource } from '../shared/log-investigation';
import { RequestError } from '../src/api';
import { discardDeniedLogEvidence } from '../src/logs/log-access';

const capture = (source: LogSource): LogCapture => ({
  id: source,
  capturedAt: '2026-09-27T13:00:00Z',
  observation: { source, lines: ['Protected captured line'], bounded: true },
  bookmarks: [{ id: 'note', index: 0, text: 'Protected captured line', note: 'Private note' }],
});
const denied = new RequestError('Access denied.', 403);

test('denied log source drops current and previous evidence together with context and bookmark notice', () => {
  const state = {
    capture: capture('messages'),
    previous: capture('messages'),
    selected: 0,
    notice: 'Line 1 bookmarked.',
  };
  assert.deepEqual(discardDeniedLogEvidence(state, 'messages', denied), {
    capture: undefined,
    previous: undefined,
    selected: undefined,
    notice: '',
  });
  // Dropping the capture also removes its embedded protected text, bookmarks and notes.
  assert.equal(state.capture.bookmarks[0].note, 'Private note');
});

test('transient log failures retain the last capture, notes and comparison by identity', () => {
  const state = {
    capture: capture('messages'),
    previous: capture('messages'),
    selected: 0,
    notice: 'Line 1 bookmarked.',
  };
  for (const failure of [new RequestError('Unavailable.', 500), new Error('Network failure.')]) {
    assert.equal(discardDeniedLogEvidence(state, 'messages', failure), state);
  }
});

test('denial of another source preserves permitted captured evidence and its comparison', () => {
  const state = {
    capture: capture('messages'),
    previous: capture('messages'),
    selected: 0,
    notice: 'Line 1 bookmarked.',
  };
  assert.equal(discardDeniedLogEvidence(state, 'alerts', denied), state);
});

test('source matching is independent for the current capture and its previous observation', () => {
  const state = {
    capture: capture('messages'),
    previous: capture('alerts'),
    selected: 0,
    notice: 'Line 1 bookmarked.',
  };
  assert.deepEqual(discardDeniedLogEvidence(state, 'alerts', denied), {
    ...state,
    previous: undefined,
  });
  assert.deepEqual(discardDeniedLogEvidence(state, 'messages', denied), {
    ...state,
    capture: undefined,
    selected: undefined,
    notice: '',
  });
  const empty = { capture: undefined, previous: undefined, selected: undefined, notice: '' };
  assert.equal(discardDeniedLogEvidence(empty, 'messages', denied), empty);
});
