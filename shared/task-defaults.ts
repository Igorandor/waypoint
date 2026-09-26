/** Complete on-demand native task payload, grouped by native value type. */
export function taskDefaults(operator: string): Record<string, any> {
  const task: Record<string, any> = {};
  for (const name of [
    'Name',
    'TaskClass',
    'Description',
    'TimePeriodEvery',
    'TimePeriodDay',
    'DailyFrequencyTime',
    'DailyIncrement',
    'EndDate',
    'RunAfterGUID',
    'OutputDirectory',
    'OutputFilename',
  ])
    task[name] = '';
  for (const name of ['EmailOnCompletion', 'EmailOnError', 'EmailOnExpiration']) task[name] = [];
  for (const name of ['ExpiresDays', 'ExpiresHours', 'ExpiresMinutes']) task[name] = 0;
  for (const name of ['EmailOutput', 'Expires', 'OpenOutputFile', 'OutputFileIsBinary', 'IsBatch'])
    task[name] = false;
  for (const name of ['SuspendOnError', 'SuspendTerminated', 'RescheduleOnStart'])
    task[name] = true;
  return {
    ...task,
    Settings: {},
    RunAsUser: operator,
    NameSpace: '%SYS',
    Priority: 'Normal',
    TimePeriod: 'On Demand',
    DailyFrequency: 'Once',
    DailyStartTime: '00:00:00',
    DailyEndTime: '00:00:00',
    StartDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    MirrorStatus: 'Any',
  };
}
