import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { StateBlock } from '../components/StateBlock';

export default function NotFound() {
  return (
    <Screen title="HexRun">
      <StateBlock icon="map" title="Bu sayfa bulunamadı" action="Haritaya dön" onAction={() => router.replace('/')} />
    </Screen>
  );
}
