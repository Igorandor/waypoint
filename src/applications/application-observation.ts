import { iris, RequestError } from '../api';
import {
  appString,
  isApplicationRecord,
  validApplicationName,
  type ApplicationSource,
  type ApplicationDossier,
} from '../../shared/application-insights';

const omitted = (path: string, explanation: string): ApplicationSource => ({
  path,
  query: {},
  observedAt: new Date().toISOString(),
  outcome: 'not-needed',
  explanation,
});
async function read(path: string, query: Record<string, string>): Promise<ApplicationSource> {
  try {
    const result = await iris(path, query);
    if (!isApplicationRecord(result.data))
      throw new Error('The native detail response was not an object.');
    if (new TextEncoder().encode(JSON.stringify(result.data)).length > 300_000)
      throw new Error(
        'This source exceeds the 300 KB workspace limit. Inspect it in the command station.',
      );
    return {
      path,
      query,
      observedAt: new Date().toISOString(),
      outcome: 'read',
      data: result.data,
    };
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) throw error;
    return {
      path,
      query,
      observedAt: new Date().toISOString(),
      outcome:
        error instanceof RequestError && error.status === 403
          ? 'denied'
          : error instanceof RequestError && error.status === 404
            ? 'missing'
            : 'failed',
      explanation: (error as Error).message,
    };
  }
}
export async function observeApplication(name: string): Promise<ApplicationDossier> {
  if (!validApplicationName(name))
    throw new Error('Choose a valid application path from the inventory.');
  const configuration = await read('/v2/web-app', { name });
  const ns = appString(configuration.data?.NameSpace);
  const resource = appString(configuration.data?.Resource);
  const [namespace, entryResource] = await Promise.all([
    configuration.outcome === 'read' && ns
      ? read('/v2/namespace', { name: ns })
      : Promise.resolve(
          omitted('/v2/namespace', 'No readable application namespace was supplied.'),
        ),
    configuration.outcome === 'read' && resource
      ? read('/v2/security/resource', { name: resource })
      : Promise.resolve(
          omitted('/v2/security/resource', 'No readable application entry resource was supplied.'),
        ),
  ]);
  return {
    application: name,
    capturedAt: new Date().toISOString(),
    configuration,
    namespace,
    entryResource,
  };
}
