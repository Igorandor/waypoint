import 'dotenv/config';
import { createApp } from './app.js';
import { runtimeConfiguration } from './runtime-config.js';
const configuration = runtimeConfiguration(process.env);
const server = createApp(configuration).listen(configuration.port, configuration.host, () =>
  console.log('Waypoint operator gateway listening on ' + configuration.port),
);
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
