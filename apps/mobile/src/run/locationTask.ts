/**
 * Arka plan konum görevi. Modül yüklendiğinde (uygulama girişinde) tanımlanmalıdır;
 * iOS uygulamayı arka planda yeniden başlattığında da çalışır.
 */
import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { getRunController, LOCATION_TASK, toTrackPoint } from './native';

if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    try {
      await getRunController().ingest(data.locations.map(toTrackPoint));
    } catch {
      // Görev asla atmamalı.
    }
  });
}
