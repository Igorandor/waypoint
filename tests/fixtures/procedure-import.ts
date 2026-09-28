import { procedureBodySchema } from '../../shared/procedure';
export const importBody = procedureBodySchema.parse({
  title: 'Long procedure import',
  description: 'Synthetic definition',
  expectedOutcome: 'Review evidence',
  tags: [],
  steps: Array.from({ length: 18 }, (_, index) => ({
    id: 'step-' + (index + 1),
    kind: 'checklist',
    title: 'Checkpoint ' + (index + 1),
    instruction: 'Review evidence',
    items: [{ id: 'confirm', text: 'Confirm evidence', required: false }],
    requireNote: false,
    reference: 'https://example.com/step-' + (index + 1),
  })),
});
