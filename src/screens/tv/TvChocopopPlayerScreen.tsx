/**
 * TvChocopopPlayerScreen.tsx
 * Reproductor HLS adaptativo:
 * - Expo Go → expo-av (único player disponible sin native modules)
 * - Build   → react-native-video con ExoPlayer (HLS nativo)
 *
 * DEBUG OVERLAY: muestra URL, fuente de datos y error en pantalla
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, BackHandler,
  StyleSheet, Animated, Dimensions, ActivityIndicator, ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, Radio, RefreshCw, WifiOff, Maximize2, Minimize2, Bug } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import TvFocusable from '../../components/tv/TvFocusable';
import { ChocopopService, ChocopopChannel } from '../../services/ChocopopService';

const { height: H } = Dimensions.get('window');
const CAROUSEL_H = 165;
const LIVE_ACCENT = '#BF40BF';

// ─── Detección de entorno ─────────────────────────────────────────────────────
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Headers para que el servidor de streaming acepte el request
const STREAM_HEADERS = {
  'Referer': 'http://tv.chocopopflow.com/',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; AFTMM Build/NS6271) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.61 Mobile Safari/537.36',
  'Origin': 'http://tv.chocopopflow.com',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
const ACCENT_COLORS = ['#B026FF','#00e3fd','#ff6b35','#f7c59f','#39d353','#ffb151','#ff4757','#2ed573'];
function getAccent(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENT_COLORS[h % ACCENT_COLORS.length];
}

// ─── Video Player adaptativo ──────────────────────────────────────────────────
function UniversalVideo({
  uri,
  onLoad,
  onError,
  onBuffer,
}: {
  uri: string;
  onLoad: () => void;
  onError: (e?: any) => void;
  onBuffer?: (e: { isBuffering: boolean }) => void;
}) {
  console.log(`[Player] Iniciando stream: ${uri} | entorno: ${IS_EXPO_GO ? 'ExpoGo' : 'Build'}`);

  if (IS_EXPO_GO) {
    const { Video: AvVideo, ResizeMode } = require('expo-av');
    return (
      <AvVideo
        source={{ uri, headers: STREAM_HEADERS }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping={false}
        volume={1.0}
        onLoad={onLoad}
        onError={(e: any) => {
          console.error('[Player expo-av] Error:', JSON.stringify(e));
          onError(e);
        }}
        onPlaybackStatusUpdate={(status: any) => {
          if (!status.isLoaded && status.error) {
            console.error('[Player expo-av] PlaybackStatus error:', status.error);
            onError();
          }
          if (status.isPlaying && onBuffer) onBuffer({ isBuffering: false });
        }}
      />
    );
  }

  // react-native-video para builds — ExoPlayer nativo con HLS completo
  const RNVideo = require('react-native-video').default;
  return (
    <RNVideo
      source={{ uri, headers: STREAM_HEADERS }}
      style={StyleSheet.absoluteFillObject}
      resizeMode="contain"
      paused={false}
      repeat={false}
      volume={1.0}
      onLoad={() => {
        console.log('[Player RNVideo] onLoad OK:', uri);
        onLoad();
      }}
      onError={(e: any) => {
        console.error('[Player RNVideo] Error:', JSON.stringify(e));
        onError(e);
      }}
      onBuffer={({ isBuffering }: { isBuffering: boolean }) => {
        console.log('[Player RNVideo] buffering:', isBuffering);
        if (onBuffer) onBuffer({ isBuffering });
      }}
      minLoadRetryCount={3}
      bufferConfig={{
        minBufferMs: 5000,
        maxBufferMs: 30000,
        bufferForPlaybackMs: 2500,
        bufferForPlaybackAfterRebufferMs: 5000,
      }}
    />
  );
}

// ─── Debug Overlay ───────────────────────────────────────────────────────────
function DebugOverlay({ url, error, source }: { url: string; error: string; source: string }) {
  return (
    <View style={debugStyles.overlay}>
      <Text style={debugStyles.title}>🔍 DEBUG</Text>
      <Text style={debugStyles.label}>Entorno: <Text style={debugStyles.value}>{IS_EXPO_GO ? 'Expo Go' : 'Build'}</Text></Text>
      <Text style={debugStyles.label}>Fuente datos: <Text style={debugStyles.value}>{source}</Text></Text>
      <ScrollView style={{ maxHeight: 80 }}>
        <Text style={debugStyles.label}>URL: <Text style={debugStyles.url}>{url || '(sin URL)'}</Text></Text>
      </ScrollView>
      {error ? <Text style={debugStyles.error}>Error: {error}</Text> : null}
    </View>
  );
}

const debugStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', bottom: 180, left: 16, right: 16, zIndex: 999,
    backgroundColor: 'rgba(0,0,0,0.92)', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#BF40BF',
  },
  title: { color: '#BF40BF', fontSize: 12, fontWeight: '900', marginBottom: 4 },
  label: { color: '#888', fontSize: 10, marginBottom: 2 },
  value: { color: '#fff', fontWeight: '700' },
  url: { color: '#00e3fd', fontSize: 9 },
  error: { color: '#ff4757', fontSize: 10, marginTop: 4, fontWeight: '700' },
});

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function TvChocopopPlayerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const initialChannel: ChocopopChannel | undefined = route.params?.channel;

  const [channels, setChannels] = useState<ChocopopChannel[]>([]);
  const [current, setCurrent] = useState<ChocopopChannel | null>(initialChannel || null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [dataSource, setDataSource] = useState('cargando...');

  const pulsAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = () =>
      Animated.sequence([
        Animated.timing(pulsAnim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
        Animated.timing(pulsAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]).start(() => pulse());
    pulse();
  }, []);

  useEffect(() => {
    console.log('[ChocopopPlayer] Iniciando fetchChannels...');
    ChocopopService.fetchChannels().then((chs) => {
      console.log(`[ChocopopPlayer] fetchChannels completado: ${chs.length} canales`);
      if (chs.length > 0) {
        console.log(`[ChocopopPlayer] Primera URL: ${chs[0].url}`);
        // Detectar fuente aproximada por cantidad de canales
        if (chs.length > 50) setDataSource('scraping (58+ canales)');
        else if (chs.length > 30) setDataSource('Firestore (~35 canales)');
        else setDataSource(`hardcoded (${chs.length} canales)`);
      }
      setChannels(chs);
      if (!current && chs.length > 0) setCurrent(chs[0]);
    });
  }, []);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFullscreen) {
        setIsFullscreen(false);
      } else {
        navigation.goBack();
      }
      return true;
    });
    return () => h.remove();
  }, [navigation, isFullscreen]);

  const selectChannel = useCallback((ch: ChocopopChannel) => {
    if (ch.m3u8 === current?.m3u8) return;
    setIsLoading(true);
    setHasError(false);
    setErrorDetail('');
    setCurrent(ch);
    setRetryKey((k) => k + 1);
  }, [current]);

  const handleLoad = useCallback(() => {
    console.log('[ChocopopPlayer] ✅ Video cargado exitosamente');
    setIsLoading(false);
    setHasError(false);
    setErrorDetail('');
  }, []);

  const handleError = useCallback((e?: any) => {
    const detail = e?.error?.localizedDescription || e?.error?.errorString || JSON.stringify(e)?.slice(0, 150) || 'Error desconocido';
    console.error('[ChocopopPlayer] ❌ Error reproduciendo:', detail);
    setErrorDetail(detail);
    setHasError(true);
    setIsLoading(false);
    // Auto-mostrar debug al primer error
    setShowDebug(true);
  }, []);

  const handleBuffer = useCallback(({ isBuffering }: { isBuffering: boolean }) => {
    if (!isBuffering) setIsLoading(false);
  }, []);

  const retry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setErrorDetail('');
    setRetryKey((k) => k + 1);
  }, []);

  const keyExtractor = useCallback((item: ChocopopChannel) => item.m3u8, []);

  const renderChannel = useCallback(({ item }: { item: ChocopopChannel }) => {
    const isActive = item.m3u8 === current?.m3u8;
    const accent = getAccent(item.name);
    return (
      <TvFocusable
        onPress={() => selectChannel(item)}
        scaleTo={1.08}
        borderWidth={0}
        style={{ borderRadius: 12, marginRight: 12 }}
      >
        {(focused: boolean) => (
          <View style={[
            styles.channelCard,
            isActive && { borderColor: accent, backgroundColor: '#1a1a20' },
            focused && { borderColor: 'rgba(255,255,255,0.4)', backgroundColor: '#1c1c24' },
          ]}>
            {item.poster ? (
              <Image
                source={{ uri: item.poster, headers: { Referer: 'http://tv.chocopopflow.com/' } }}
                style={styles.channelPoster}
                contentFit="contain"
              />
            ) : (
              <View style={[styles.channelPlaceholder, { backgroundColor: `${accent}22` }]}>
                <Text style={[styles.channelInitials, { color: accent }]}>{getInitials(item.name)}</Text>
              </View>
            )}
            {isActive && (
              <View style={[styles.activeBadge, { backgroundColor: accent }]}>
                <Animated.View style={[styles.activeDot, { opacity: pulsAnim }]} />
              </View>
            )}
            <View style={styles.channelNameWrap}>
              <Text numberOfLines={2} style={[styles.channelName, (isActive || focused) && { color: '#fff' }]}>
                {item.name}
              </Text>
            </View>
          </View>
        )}
      </TvFocusable>
    );
  }, [current, selectChannel, pulsAnim]);

  if (!current) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={LIVE_ACCENT} />
        <Text style={styles.loadingText}>Cargando canales...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.playerContainer, isFullscreen && { height: H }]}>

        {!hasError && (
          <UniversalVideo
            key={`${current.m3u8}-${retryKey}`}
            uri={current.url}
            onLoad={handleLoad}
            onError={handleError}
            onBuffer={handleBuffer}
          />
        )}

        {isLoading && !hasError && (
          <View style={styles.overlayCenter}>
            <Radio color={LIVE_ACCENT} size={40} strokeWidth={1.5} />
            <Text style={styles.overlayTitle}>{current.name}</Text>
            <View style={styles.liveRow}>
              <Animated.View style={[styles.liveDot, { opacity: pulsAnim }]} />
              <Text style={styles.liveRowText}>CONECTANDO...</Text>
            </View>
          </View>
        )}

        {hasError && (
          <View style={styles.overlayCenter}>
            <WifiOff color={LIVE_ACCENT} size={40} strokeWidth={1.5} />
            <Text style={styles.overlayTitle}>{current.name}</Text>
            <Text style={styles.errorSub}>Señal no disponible</Text>
            <TvFocusable onPress={retry} scaleTo={1.08} borderWidth={0} style={{ borderRadius: 10, marginTop: 16 }}>
              {(f: boolean) => (
                <View style={[styles.retryBtn, f && styles.retryBtnFocused]}>
                  <RefreshCw color={f ? '#000' : LIVE_ACCENT} size={16} />
                  <Text style={[styles.retryText, f && { color: '#000' }]}>Reintentar</Text>
                </View>
              )}
            </TvFocusable>
          </View>
        )}

        {/* Debug Overlay */}
        {showDebug && (
          <DebugOverlay
            url={current.url}
            error={errorDetail}
            source={dataSource}
          />
        )}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradient}
          pointerEvents="none"
        />

        {!isFullscreen && (
          <Animated.View style={styles.badge} pointerEvents="box-none">
            <TvFocusable onPress={() => navigation.goBack()} scaleTo={1.1} borderWidth={0} style={{ borderRadius: 50 }}>
              {(f: boolean) => (
                <View style={[styles.badgeBtn, f && styles.badgeBtnFocused]}>
                  <ArrowLeft color={f ? '#000' : '#fff'} size={20} />
                </View>
              )}
            </TvFocusable>
            <View style={styles.badgeInfo}>
              <View style={styles.liveRow}>
                <Animated.View style={[styles.liveDotSmall, { opacity: pulsAnim }]} />
                <Text style={styles.badgeLiveText}>EN VIVO</Text>
              </View>
              <Text numberOfLines={1} style={styles.badgeTitle}>{current.name}</Text>
            </View>
            <TvFocusable onPress={retry} scaleTo={1.1} borderWidth={0} style={{ borderRadius: 50 }}>
              {(f: boolean) => (
                <View style={[styles.badgeBtn, f && styles.badgeBtnFocused]}>
                  <RefreshCw color={f ? '#000' : '#B026FF'} size={16} />
                </View>
              )}
            </TvFocusable>
            {/* Botón Debug */}
            <TvFocusable onPress={() => setShowDebug(v => !v)} scaleTo={1.1} borderWidth={0} style={{ borderRadius: 50 }}>
              {(f: boolean) => (
                <View style={[styles.badgeBtn, f && styles.badgeBtnFocused, showDebug && { borderColor: '#BF40BF' }]}>
                  <Bug color={f ? '#000' : (showDebug ? '#BF40BF' : '#888')} size={16} />
                </View>
              )}
            </TvFocusable>
            <TvFocusable onPress={() => setIsFullscreen(v => !v)} scaleTo={1.1} borderWidth={0} style={{ borderRadius: 50 }}>
              {(f: boolean) => (
                <View style={[styles.badgeBtn, f && styles.badgeBtnFocused]}>
                  {isFullscreen
                    ? <Minimize2 color={f ? '#000' : '#00e3fd'} size={16} />
                    : <Maximize2 color={f ? '#000' : '#00e3fd'} size={16} />}
                </View>
              )}
            </TvFocusable>
          </Animated.View>
        )}
      </View>

      {!isFullscreen && (
        <View style={styles.carousel}>
          <FlatList
            data={channels}
            keyExtractor={keyExtractor}
            renderItem={renderChannel}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={5}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  centerScreen: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#000', gap: 16,
  },
  loadingText: { color: LIVE_ACCENT, fontSize: 16, fontWeight: '700' },
  playerContainer: { flex: 1, backgroundColor: '#000', position: 'relative' },
  overlayCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10,
  },
  overlayTitle: {
    color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5,
    textAlign: 'center', paddingHorizontal: 32,
  },
  errorSub: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveRowText: { color: LIVE_ACCENT, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE_ACCENT },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE_ACCENT },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: LIVE_ACCENT, backgroundColor: 'rgba(191,64,191,0.1)',
  },
  retryBtnFocused: { backgroundColor: LIVE_ACCENT, borderColor: LIVE_ACCENT },
  retryText: { color: LIVE_ACCENT, fontSize: 14, fontWeight: '800' },
  gradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, zIndex: 1,
  },
  badge: {
    position: 'absolute', top: 20, left: 24, right: 24,
    flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 20,
  },
  badgeBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeBtnFocused: { backgroundColor: '#fff', borderColor: '#fff' },
  badgeInfo: { flex: 1, gap: 2 },
  badgeLiveText: { color: LIVE_ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  badgeTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  carousel: {
    height: CAROUSEL_H, backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  channelCard: {
    width: 140, height: 90,
    borderRadius: 12, overflow: 'hidden',
    backgroundColor: '#111118', borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)', position: 'relative',
  },
  channelPoster: { width: '100%', height: '75%', backgroundColor: '#0a0a0a' },
  channelPlaceholder: { width: '100%', height: '75%', alignItems: 'center', justifyContent: 'center' },
  channelInitials: { fontSize: 20, fontWeight: '900' },
  channelNameWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  channelName: { color: '#9CA3AF', fontSize: 10, fontWeight: '700', letterSpacing: 0.2, textAlign: 'center' },
  activeBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 12, height: 12, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
});
