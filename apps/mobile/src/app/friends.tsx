import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useServices } from '../services';

/** hexrun://friends?code=… → davet kodunu kabul et, arkadaş listesine git. */
export default function FriendsLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { api, queryClient } = useServices();
  useEffect(() => {
    (async () => {
      if (code) {
        const r = await api.friends.accept(code).catch(() => null);
        if (r) queryClient.setQueryData(['friends'], r);
      }
      router.replace({ pathname: '/profile', params: { tab: 'friends' } });
    })();
  }, [code, api, queryClient]);
  return null;
}
