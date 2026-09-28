import { procedureBodySchema } from '../../shared/procedure';
export function version(number: number) {
  const suffix = number === 1 ? 'old' : 'new';
  return {
    number,
    createdAt: '2026-09-28T12:00:00.000Z',
    createdBy: 'Synthetic operator',
    changeNote: number === 1 ? 'Original instruction' : 'Recreated the three steps',
    body: procedureBodySchema.parse({
      title: 'Review application',
      description: 'Synthetic procedure comparison',
      expectedOutcome: 'Record a decision',
      tags: [],
      steps: [
        {
          id: 'read-' + suffix,
          kind: 'observation',
          title: 'Read application',
          instruction: 'Inspect application configuration',
          source: 'application',
          target: '/csp/training-' + suffix,
        },
        {
          id: 'checkpoint-' + suffix,
          kind: 'checklist',
          title: 'Operator review',
          instruction: 'Review the captured evidence',
          items: [{ id: 'confirm', text: 'Confirm ' + suffix + ' destination', required: true }],
          requireNote: number === 1,
          reference: 'https://example.com/' + suffix,
        },
        {
          id: 'assertion-' + suffix,
          kind: 'assertion',
          title: 'Check application',
          instruction: 'Check the recorded result',
          sourceStepId: 'read-' + suffix,
          check: 'application-enabled',
          expected: number === 1,
        },
      ],
    }),
  };
}

export const comparisonVersions = [version(1), version(2)];
