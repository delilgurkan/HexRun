import { z } from 'zod';
import { RUN_SOURCES, SLOTS } from '@hexrun/core';

export const point = z.object({
  lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180),
  t: z.number().int().positive(),
  acc: z.number().min(0).max(10_000).optional(),
});

export const submitRun = z.object({
  clientRunId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_.:-]+$/),
  source: z.enum(RUN_SOURCES as unknown as [string, ...string[]]),
  points: z.array(point).min(2).max(60_000),
  externalId: z.string().max(128).optional(),
  device: z.string().max(80).optional(),
});

export const cells = z.object({ cells: z.array(z.string().regex(/^[0-9a-f]{15}$/)).max(200) });
export const email = z.object({ email: z.string().max(320) });
export const verify = z.object({ email: z.string().max(320), code: z.string().regex(/^\d{6}$/) });
export const apple = z.object({ identityToken: z.string().min(10).max(5000), fullName: z.string().max(80).optional() });
export const google = z.object({ idToken: z.string().min(10).max(5000) });
export const refresh = z.object({ refreshToken: z.string().min(20).max(200) });
export const updateMe = z.object({
  username: z.string().max(40).optional(),
  displayName: z.string().max(80).optional(),
  slot: z.enum(SLOTS as unknown as [string, ...string[]]).optional(),
});
export const privacy = z.object({
  home: z.object({ lat: z.number().min(-85).max(85), lng: z.number().min(-180).max(180) }).nullable(),
  radiusM: z.number().int().min(0).max(5000).optional(),
});
export const pushToken = z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android']) });
export const insignia = z.object({ slots: z.array(z.string().max(40).nullable()).max(3) });
export const team = z.object({ name: z.string().max(64) });
export const code = z.object({ code: z.string().min(4).max(20) });
export const readNotifs = z.object({ ids: z.array(z.string().uuid()).max(500).optional() });
export const note = z.object({ text: z.string().min(1).max(500) });
export const remind = z.object({ on: z.boolean() });
export const activity = z.object({ running: z.boolean() });
export const integrationPatch = z.object({ importEnabled: z.boolean().optional(), exportEnabled: z.boolean().optional() });
export const connectBody = z.object({ device: z.string().max(80).optional() }).optional();
export const waitlist = z.object({ email: z.string().max(320), locale: z.enum(['tr', 'en']).default('tr') });
export const decision = z.object({ decision: z.enum(['approve', 'reject']) });
export const linkBody = z.object({ state: z.string().min(8).max(64), externalUserId: z.string().min(1).max(128) });
