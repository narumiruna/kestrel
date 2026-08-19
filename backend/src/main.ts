import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createContainer } from './container';
import { Logger } from './logger';

const port = Number(process.env.PORT ?? 3300);

serve({ fetch: createApp(createContainer()).fetch, port }, () => {
  Logger.log(`kestrel-cloud-api listening on ${port}`, 'Bootstrap');
});
