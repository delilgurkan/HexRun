import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { router } from 'expo-router';
import type { StatsResponse } from '@hexrun/contracts';
import { ApiError } from '../api/errors';
import { permStore } from '../lib/permissions';
import { runStore } from '../run/controller';
import { LeagueScreen } from '../screens/league/LeagueScreen';
import { MapScreen } from '../screens/map/MapScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { BadgesTab } from '../screens/profile/BadgesTab';
import { SummaryView, summaryVariant } from '../screens/run/SummaryView';
import { fakeApi, makeTestServices, renderWith } from '../test/utils';
import * as fx from '../test/fixtures';

const stats = (cells: number): StatsResponse => ({
  territoryM2: cells * 307,
  cells,
  regionRank: null,
  regionName: 'Kadıköy',
  monthDistanceM: 0,
  avgPaceSecPerKm: null,
  defenses: { won: 0, total: 0 },
  biggestLoopM2: 0,
  streakDays: 34,
  bestStreakDays: 34,
  last14Days: [],
  recent: [],
  silhouettes: [],
});

const page = <T,>(items: T[]) => ({ items, nextCursor: null });

beforeEach(() => {
  permStore.set({ location: 'whenInUse', notifications: 'granted' });
  (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true });
  jest.clearAllMocks();
});

describe('Harita durumları (03/03b)', () => {
  const baseApi = () => ({
    me: { get: async () => fx.me, stats: async () => stats(12) },
    duels: { list: async () => ({ attacking: [], defending: [] }) },
    events: async () => [],
    notifications: { list: async () => page(fx.notifications) },
  });

  it('yükleniyor: petek iskeleti ve "Bölgeler yükleniyor"', async () => {
    await renderWith(<MapScreen />, { api: fakeApi(baseApi()) });
    expect(await screen.findByTestId('map-loading')).toBeTruthy();
    expect(screen.getByText('Bölgeler yükleniyor')).toBeTruthy();
  });

  it('dolu: birincil eylem KOŞUYA BAŞLA, okunmamış bildirim rozeti', async () => {
    await renderWith(<MapScreen />, { api: fakeApi({ ...baseApi(), map: { get: async () => fx.mapResponse() } }) });
    expect(await screen.findByText('KOŞUYA BAŞLA')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Bildirimler, 1 okunmamış')).toBeTruthy());
    expect(screen.queryByTestId('first-loop')).toBeNull();
    expect(screen.getByText('34 gün')).toBeTruthy();
  });

  it('boş: ilk gün "İlk halkan" önerisi', async () => {
    await renderWith(<MapScreen />, {
      api: fakeApi({
        ...baseApi(),
        me: { get: async () => fx.me, stats: async () => stats(0) },
        map: { get: async () => fx.mapResponse(), firstLoop: async () => ({ ring: [{ lat: 40.98, lng: 29.03 }, { lat: 40.99, lng: 29.03 }], lengthM: 2100, areaM2: 4800, emptyCells: 16 }) },
      }),
    });
    expect(await screen.findByTestId('first-loop')).toBeTruthy();
    expect(screen.getByText('Buradaki petekler boş')).toBeTruthy();
    expect(screen.getByText('BU HALKAYLA BAŞLA')).toBeTruthy();
    expect(screen.getByText('Kendi rotamla koşacağım')).toBeTruthy();
  });

  it('çevrimdışı: son bilinen harita + tekrar dene, koşu yine başlatılabilir', async () => {
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: false });
    const services = makeTestServices(fakeApi({ ...baseApi(), map: { get: async () => Promise.reject(new ApiError(0, 'network', 'yok')) } }));
    await services.kv.setItem('hexrun.lastMap.v1', JSON.stringify({ at: Date.now() - 12 * 60_000, res: fx.mapResponse() }));
    await renderWith(<MapScreen />, { services });
    expect(await screen.findByTestId('offline-card')).toBeTruthy();
    expect(screen.getByText('Harita 12 dk önceki hali. Koşun kaydedilir, fetih bağlanınca hesaplanır.')).toBeTruthy();
    expect(screen.getByText('Tekrar dene')).toBeTruthy();
    expect(screen.getByText('KOŞUYA BAŞLA')).toBeTruthy();
  });

  it('konum reddedildi: koşu kilitli', async () => {
    permStore.set({ location: 'denied' });
    await renderWith(<MapScreen />, { api: fakeApi({ ...baseApi(), map: { get: async () => fx.mapResponse() } }) });
    expect(await screen.findByText('Konum izni yok · koşu kilitli')).toBeTruthy();
  });
});

describe('Koşu özeti (08 A/B/C + 15B)', () => {
  const actions = { onDone: jest.fn(), onEditSuggestion: jest.fn(), onMakeLoop: jest.fn(), onNote: jest.fn(async () => undefined) };

  it('A · halka kapandı: alan, düello zaferi, rozet', async () => {
    expect(summaryVariant(fx.summaryClosed)).toBe('closed');
    await renderWith(<SummaryView s={fx.summaryClosed} actions={actions} />);
    expect(screen.getByText("62 petek senin, 48'i düelloyla")).toBeTruthy();
    expect(screen.getByText('+19.220 m²')).toBeTruthy();
    expect(screen.getByText('Can 20 → 0')).toBeTruthy();
    expect(screen.getByText('Yeni rozet: Şafak Akıncısı')).toBeTruthy();
    expect(screen.getByText("Emre'le düelloyu kazandın")).toBeTruthy();
    expect(screen.getByText('Bitti · 4 Ekim Pazar · 06:29–07:14')).toBeTruthy();
  });

  it('B · halka açık kaldı: suçlama yok, sonraki adım', async () => {
    expect(summaryVariant(fx.summaryOpen)).toBe('open');
    await renderWith(<SummaryView s={fx.summaryOpen} actions={actions} />);
    expect(screen.getByText('430 m eksik')).toBeTruthy();
    expect(screen.getByText('Halka açık kaldı')).toBeTruthy();
    expect(screen.getByText('Halka olmadan haritada bir şey değişmez')).toBeTruthy();
    await fireEvent.press(screen.getByText('Bu rotayı halka yap · +430 m'));
    expect(actions.onMakeLoop).toHaveBeenCalled();
  });

  it('C · düello önerisi: seçim ekranını dolu açar', async () => {
    expect(summaryVariant(fx.summarySuggestion)).toBe('suggestion');
    await renderWith(<SummaryView s={fx.summarySuggestion} actions={actions} />);
    expect(screen.getByText("Zeynep'in alanından geçtin")).toBeTruthy();
    expect(screen.getByText('21 petek · ort. güç 55')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('edit-suggestion'));
    expect(actions.onEditSuggestion).toHaveBeenCalledWith(fx.summarySuggestion.suggestions[0]);
  });

  it('inceleniyor: harita değişmez, not eklenebilir', async () => {
    expect(summaryVariant(fx.summaryReview)).toBe('review');
    await renderWith(<SummaryView s={fx.summaryReview} actions={actions} />);
    expect(screen.getByText('Halkan inceleniyor')).toBeTruthy();
    expect(screen.getByText('44 petek beklemede')).toBeTruthy();
    await fireEvent.press(screen.getByText('Bilgi ekle'));
    await fireEvent.changeText(screen.getByPlaceholderText('Örn. tünelden geçtim, GPS sıçradı'), 'Tünel');
    await fireEvent.press(screen.getByText('Kaydet'));
    expect(actions.onNote).toHaveBeenCalledWith('Tünel');
    expect(screen.getByText('Notun iletildi')).toBeTruthy();
  });
});

describe('Rozet durumları (10b/14)', () => {
  it('yükleniyor', async () => {
    await renderWith(<BadgesTab me={fx.me} />);
    expect(screen.getByText('Rozetler yükleniyor')).toBeTruthy();
  });

  it('boş: en yakın üç rozet ve tek eylem', async () => {
    await renderWith(<BadgesTab me={fx.me} />, { api: fakeApi({ me: { badges: async () => fx.badgesEmpty } }) });
    expect(await screen.findByText('İlk rozetin bir halka uzakta')).toBeTruthy();
    expect(screen.getByText('40 rozet var. Şunlar sana en yakın:')).toBeTruthy();
    expect(screen.getByText('7 Gün')).toBeTruthy();
    expect(screen.getByText('İLK HALKAYA BAŞLA')).toBeTruthy();
  });

  it('hata: son bilinen sayı korunur', async () => {
    const services = makeTestServices(fakeApi({ me: { badges: async () => Promise.reject(new ApiError(503, 'unavailable', 'x')) } }));
    await services.kv.setItem('hexrun.badges.last.v1', JSON.stringify({ earned: 14, total: 40 }));
    await renderWith(<BadgesTab me={fx.me} />, { services });
    expect(await screen.findByText('Rozetler yüklenemedi')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Son bilinen: 14 / 40. Kazandığın hiçbir rozet kaybolmaz; bağlantı gelince eşitlenir.')).toBeTruthy());
    expect(screen.getByText('Hata kodu: RZ-503')).toBeTruthy();
  });

  it('dolu: 3 nişan slotu ve koleksiyon', async () => {
    await renderWith(<BadgesTab me={fx.me} />, { api: fakeApi({ me: { badges: async () => fx.badgesFull } }) });
    expect(await screen.findByText('Nişanlar')).toBeTruthy();
    expect(screen.getByText('1/3 · değişiklik 1/gün')).toBeTruthy();
    expect(screen.getAllByText('Boş slot')).toHaveLength(2);
    expect(screen.getByText('2 / 40')).toBeTruthy();
    expect(screen.getByTestId('insignia-intro')).toBeTruthy();
  });
});

describe('Lig durumları (11/11b)', () => {
  it('dolu: senin satırın altta sabit, bitişe kalan süre', async () => {
    await renderWith(<LeagueScreen />, { api: fakeApi({ league: async () => fx.league(5), me: { get: async () => fx.me } }) });
    expect(await screen.findByText('Kadıköy')).toBeTruthy();
    expect(screen.getByTestId('league-me')).toBeTruthy();
    expect(screen.getByText("2.'ye 420 m² önde")).toBeTruthy();
    expect(screen.getByText('bitişe 2 g 7 sa')).toBeTruthy();
    expect(screen.getByTestId('league-row-3')).toBeTruthy();
  });

  it('boş: hafta yeni başladı, satırın 0 m² ile orada', async () => {
    await renderWith(<LeagueScreen />, { api: fakeApi({ league: async () => fx.league(0), me: { get: async () => fx.me } }) });
    expect(await screen.findByText('Hafta yeni başladı')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('league-me')).toBeTruthy());
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('yükleniyor', async () => {
    await renderWith(<LeagueScreen />);
    expect(screen.getByTestId('league-loading')).toBeTruthy();
  });

  it('hata: tekrar dene', async () => {
    await renderWith(<LeagueScreen />, { api: fakeApi({ league: async () => Promise.reject(new ApiError(500, 'x', 'x')) }) });
    expect(await screen.findByText('Sıralama güncellenemedi')).toBeTruthy();
    expect(screen.getByText('Tekrar dene')).toBeTruthy();
  });

  it('dönem değişince yeniden sorgular', async () => {
    const league = jest.fn(async () => fx.league(3));
    await renderWith(<LeagueScreen />, { api: fakeApi({ league, me: { get: async () => fx.me } }) });
    await screen.findByText('Kadıköy');
    await fireEvent.press(screen.getByLabelText('Aylık'));
    await waitFor(() => expect(league).toHaveBeenCalledWith('individual', 'month'));
  });
});

describe('Bildirim merkezi (13)', () => {
  it('gruplar, satır içi eylem ve filtre', async () => {
    const list = jest.fn(async () => page(fx.notifications));
    const read = jest.fn(async () => null);
    await renderWith(<NotificationsScreen />, { api: fakeApi({ notifications: { list, read } }) });
    expect(await screen.findByText("Selin'le düello · 17 petek")).toBeTruthy();
    expect(screen.getByText('Bugün')).toBeTruthy();
    expect(screen.getByText('Dün')).toBeTruthy();
    expect(screen.getByText('Bu hafta')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('notif-action-n1'));
    expect(router.push).toHaveBeenCalledWith('/run?defend=d9');
    await fireEvent.press(screen.getByTestId('filter-siege'));
    await waitFor(() => expect(list).toHaveBeenCalledWith('siege', null));
    await fireEvent.press(screen.getByTestId('mark-read'));
    await waitFor(() => expect(read).toHaveBeenCalledWith(undefined));
  });

  it('boş durum', async () => {
    await renderWith(<NotificationsScreen />, { api: fakeApi({ notifications: { list: async () => page([]) } }) });
    expect(await screen.findByText('Yeni bildirim yok.')).toBeTruthy();
  });
});

afterAll(() => {
  runStore.set({ active: false, snap: null, conquest: null });
});
