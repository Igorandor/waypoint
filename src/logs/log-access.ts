import type { LogCapture, LogSource } from '../../shared/log-investigation';
import { RequestError } from '../api';

type LogEvidenceState = {
  capture: LogCapture | undefined;
  previous: LogCapture | undefined;
  selected: number | undefined;
  notice: string;
};

export function discardDeniedLogEvidence(
  state: LogEvidenceState,
  source: LogSource,
  cause: unknown,
): LogEvidenceState {
  if (!(cause instanceof RequestError) || cause.status !== 403) return state;
  const deniedCapture = state.capture?.observation.source === source;
  const deniedPrevious = state.previous?.observation.source === source;
  if (!deniedCapture && !deniedPrevious) return state;
  return {
    capture: deniedCapture ? undefined : state.capture,
    previous: deniedPrevious ? undefined : state.previous,
    selected: deniedCapture ? undefined : state.selected,
    notice: deniedCapture ? '' : state.notice,
  };
}
