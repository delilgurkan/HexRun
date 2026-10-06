import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { RunSummary } from '@hexrun/contracts';
import { useMe, useRun } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { S } from '../../i18n';
import { startRun } from '../../run/start';
import { useServices } from '../../services';
import { SummaryView, summaryVariant } from './SummaryView';

type QState = { kind: 'pending' | 'sending' | 'failed' } | { kind: 'done'; summary: RunSummary } | { kind: 'unknown' };

/** Kuyruktaki koşunun durumunu izler: gönderildi mi, bekliyor mu? */
function useQueuedRun(clientRunId: string | undefined): [QState, () => void] {
  const { runQueue, queryClient } = useServices();
  const [st, setSt] = useState<QState>({ kind: clientRunId ? 'sending' : 'unknown' });
  useEffect(() => {
    if (!clientRunId) return;
    let alive = true;
    const check = async () => {
      const status = await runQueue.status(clientRunId);
      if (!alive) return;
      if (status === 'done') {
        const summary = await runQueue.result(clientRunId);
        if (summary && alive) {
          setSt({ kind: 'done', summary });
          void queryClient.invalidateQueries({ queryKey: ['map'] });
          void queryClient.invalidateQueries({ queryKey: ['stats'] });
          void queryClient.invalidateQueries({ queryKey: ['badges'] });
          void queryClient.invalidateQueries({ queryKey: ['duels'] });
        }
      } else if (status === 'failed') setSt({ kind: 'failed' });
      else setSt((prev) => (prev.kind === 'sending' ? prev : { kind: 'pending' }));
    };
    void check();
    const unsub = runQueue.subscribe(() => void check());
    const id = setTimeout(() => setSt((p) => (p.kind === 'sending' ? { kind: 'pending' } : p)), 8000);
    return () => {
      alive = false;
      unsub();
      clearTimeout(id);
    };
  }, [clientRunId, runQueue, queryClient]);
  const retry = () => {
    setSt({ kind: 'sending' });
    void runQueue.flush(true);
  };
  return [st, retry];
}

/** 08 · Koşu özeti. */
export function SummaryScreen() {
  const { clientRunId, runId } = useLocalSearchParams<{ clientRunId?: string; runId?: string }>();
  const { api } = useServices();
  const me = useMe();
  const [q, retry] = useQueuedRun(clientRunId);
  const remote = useRun(runId);
  const summary = q.kind === 'done' ? q.summary : remote.data;
  const done = () => router.replace('/(tabs)');

  if (!summary) {
    const pending = q.kind === 'pending' || q.kind === 'failed';
    return (
      <Screen title={S.summary.done} onBack={null} footer={<Button big label={S.summary.toMap} onPress={done} />} testID="summary-pending">
        {q.kind === 'sending' || remote.isLoading ? (
          <>
            <StateBlock title={S.summary.sending} />
            <Skeleton height={44} />
            <Skeleton height={88} />
          </>
        ) : pending ? (
          <StateBlock icon="check" title={S.summary.pendingTitle} body={S.summary.pendingBody} action={S.common.retry} onAction={retry} />
        ) : (
          <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void remote.refetch()} />
        )}
      </Screen>
    );
  }

  const v = summaryVariant(summary);
  return (
    <Screen
      title={S.summary.done}
      onBack={null}
      testID="summary"
      footer={
        v !== 'review' ? (
          <>
            {summary.totalGainedAreaM2 > 0 ? (
              <Button big label={S.summary.share} icon="shareIos" onPress={() => router.push({ pathname: '/share/[runId]', params: { runId: summary.id } })} />
            ) : null}
            <Button kind={summary.totalGainedAreaM2 > 0 ? 'secondary' : 'primary'} big label={S.summary.toMap} onPress={done} />
          </>
        ) : undefined
      }
    >
      <SummaryView
        s={summary}
        actions={{
          onDone: done,
          onMakeLoop: () => void startRun(me.data, {}),
          onEditSuggestion: (sg) =>
            router.replace({ pathname: '/duel/select', params: { cells: sg.cells.join(','), defender: sg.defender.id, cell: sg.cells[0] ?? '' } }),
          onNote: async (text) => {
            await api.runs.note(summary.id, text);
          },
        }}
      />
    </Screen>
  );
}
