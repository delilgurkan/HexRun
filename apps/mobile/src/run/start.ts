import { Alert } from 'react-native';
import { router } from 'expo-router';
import type { Me } from '@hexrun/contracts';
import { RULES } from '@hexrun/core';
import { S } from '../i18n';
import { openSettings, permStore, requestLocation } from '../lib/permissions';
import type { RunContext } from './session';
import { getRunController } from './native';

/** Nişan ve çaylak kurallarına göre halka seçenekleri. */
export function loopOptionsFor(me: Me | null | undefined): { closeRadiusM: number; minLoopLengthM: number } {
  const master = !!me?.insignia?.includes('halka-ustasi');
  const newbie = (me?.newbieDaysLeft ?? 0) > 0;
  return {
    closeRadiusM: master ? RULES.LOOP_CLOSE_M_MASTER : RULES.LOOP_CLOSE_M,
    minLoopLengthM: newbie ? RULES.MIN_LOOP_LENGTH_M_NEWBIE : RULES.MIN_LOOP_LENGTH_M,
  };
}

/** Koşu modunu başlatır; konum izni yoksa koşu kilitli kalır. */
export async function startRun(me: Me | null | undefined, context: RunContext = {}): Promise<boolean> {
  let perm = permStore.get().location;
  if (perm === 'unknown') perm = await requestLocation();
  if (perm === 'denied') {
    Alert.alert(S.run.noPermission, S.map.runLockedBody, [
      { text: S.common.cancel, style: 'cancel' },
      { text: S.permissions.openSettings, onPress: openSettings },
    ]);
    return false;
  }
  await getRunController().start(context, loopOptionsFor(me));
  router.push('/run');
  return true;
}
