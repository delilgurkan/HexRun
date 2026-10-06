import type { Config } from './config.js';
import type { Db } from './db.js';
import type { Clock } from './lib/clock.js';
import type { Mailer } from './lib/mailer.js';
import type { PushSender } from './lib/push.js';
import type { OidcVerifier } from './auth/oidc.js';

export interface Deps {
  cfg: Config;
  db: Db;
  clock: Clock;
  mailer: Mailer;
  push: PushSender;
  oidc: OidcVerifier;
  /** Dış HTTP (Strava vb.) — testte taklit edilir. */
  fetch: typeof fetch;
}
