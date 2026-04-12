/**
 * TvChocopopPlayerScreen.tsx
 * Reproductor HLS para canales de ChocoPop — usa react-native-video
 * (compatible con Expo builds — HLS nativo en Android TV)
 *
 * - react-native-video reproduciendo .m3u8 directamente via ExoPlayer
 * - Carrusel de canales en la parte inferior con D-pad
 * - Estado de carga / error / auto-retry
 * - Badge EN VIVO pulsante con botón atrás
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, BackHandler,
  StyleSheet, Animated, Dimensions, ActivityIndicator,
} from 'react-native';
import Video from 'react-native-video';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, Radio, RefreshCw, WifiOff, Maximize2, Minimize2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import TvFocusable from '../../components/tv/TvFocusable';
import { ChocopopService, ChocopopChannel } from '../../services/ChocopopService';

const { height: H } = Dimensions.get('window');
const CHANNEL_THUMB_W = 140;
const CHANNEL_THUMB_H = 90;
const CAROUSEL_H = 165;
const LIVE_ACCENT = '#BF40BF';

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

// ─── Componente ───────────────────────────────────────────────────────────────
export default function TvChocopopPlayerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const initialChannel: ChocopopChannel | undefined = route.params?.channel;

  const [channels, setChannels] = useState<ChocopopChannel[]>([]);
  const [current, setCurrent] = useState<ChocopopChannel | null>(initialChannel || null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Animaciones
  const pulsAnim = useRef(new Animated.Value(1)).current;

  // ── Pulse loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const pulse = () =>
      Animated.sequence([
        Animated.timing(pulsAnim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
        Animated.timing(pulsAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]).start(() => pulse());
    pulse();
  }, []);

  // ── Fetch canales ────────────────────────────────────────────────────────────
  useEffect(() => {
    ChocopopService.fetchChannels().then((chs) => {
      setChannels(chs);
      if (!current && chs.length > 0) setCurrent(chs[0]);
    });
  }, []);

  // ── Back handler ─────────────────────────────────────────────────────────────
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

  // ── Cambiar canal ────────────────────────────────────────────────────────────
  const selectChannel = useCallback((ch: ChocopopChannel) => {
    if (ch.m3u8 === current?.m3u8) return;
    setIsLoading(true);
    setHasError(false);
    setCurrent(ch);
    setRetryKey((k) => k + 1);
  }, [current]);

  // ── Handlers del player ──────────────────────────────────────────────────────
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleError = useCallback((e: any) => {
    console.warn('[ChocopopPlayer] Error reproduciendo:', e?.error?.localizedDescription || e);
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleBuffer = useCallback(({ isBuffering }: { isBuffering: boolean }) => {
    if (!isBuffering && isLoading) {
      setIsLoading(false);
    }
  }, [isLoading]);

  const retry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setRetryKey((k) => k + 1);
  }, []);

  const keyExtractor = useCallback((item: ChocopopChannel) => item.m3u8, []);

  // ── Card de canal ────────────────────────────────────────────────────────────
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

  // ── Cargando inicial ─────────────────────────────────────────────────────────
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
      {/* ── VIDEO PLAYER ────────────────────────────────────────── */}
      <View style={[styles.playerContainer, isFullscreen && { height: H }]}>

        {/* react-native-video — HLS nativo con ExoPlayer en Android */}
        {!hasError && (
          <Video
            key={`${current.m3u8}-${retryKey}`}
            source={{ uri: current.url }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
            paused={false}
            repeat={false}
            volume={1.0}
            onLoad={handleLoad}
            onError={handleError}
            onBuffer={handleBuffer}
            // HLS specific
            minLoadRetryCount={3}
            bufferConfig={{
              minBufferMs: 5000,
              maxBufferMs: 30000,
              bufferForPlaybackMs: 2500,
              bufferForPlaybackAfterRebufferMs: 5000,
            }}
          />
        )}

        {/* Overlay: Loading */}
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

        {/* Overlay: Error */}
        {hasError && (
          <View style={styles.overlayCenter}>
            <WifiOff color={LIVE_ACCENT} size={40} strokeWidth={1.5} />
            <Text style={styles.overlayTitle}>{current.name}</Text>
            <Text style={styles.errorSub}>Señal no disponible</Text>
            <TvFocusable onPress={retry} scaleTo={1.08} borderWidth={0} style={{ borderRadius: 10, marginTop: 20 }}>
              {(f: boolean) => (
                <View style={[styles.retryBtn, f && styles.retryBtnFocused]}>
                  <RefreshCw color={f ? '#000' : LIVE_ACCENT} size={16} />
                  <Text style={[styles.retryText, f && { color: '#000' }]}>Reintentar</Text>
                </View>
              )}
            </TvFocusable>
          </View>
        )}

        {/* Gradiente inferior */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradient}
          pointerEvents="none"
        />

        {/* Badge flotante */}
        {!isFullscreen && (
          <Animated.View style={[styles.badge]} pointerEvents="box-none">
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

      {/* ── CARRUSEL DE CANALES ──────────────────────────────────── */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    gap: 16,
  },
  loadingText: {
    color: LIVE_ACCENT,
    fontSize: 16,
    fontWeight: '700',
  },

  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },

  // Overlays
  overlayCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 10,
  },
  overlayTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  errorSub: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveRowText: {
    color: LIVE_ACCENT,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LIVE_ACCENT,
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LIVE_ACCENT,
  },

  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: LIVE_ACCENT,
    backgroundColor: 'rgba(191,64,191,0.1)',
  },
  retryBtnFocused: {
    backgroundColor: LIVE_ACCENT,
    borderColor: LIVE_ACCENT,
  },
  retryText: {
    color: LIVE_ACCENT,
    fontSize: 14,
    fontWeight: '800',
  },

  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 1,
  },

  // Badge flotante
  badge: {
    position: 'absolute',
    top: 20,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 20,
  },
  badgeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeBtnFocused: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  badgeInfo: {
    flex: 1,
    gap: 2,
  },
  badgeLiveText: {
    color: LIVE_ACCENT,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  badgeTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  // Carrusel
  carousel: {
    height: CAROUSEL_H,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  channelCard: {
    width: CHANNEL_THUMB_W,
    height: CHANNEL_THUMB_H,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111118',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)',
    position: 'relative',
  },
  channelPoster: {
    width: '100%',
    height: '75%',
    backgroundColor: '#0a0a0a',
  },
  channelPlaceholder: {
    width: '100%',
    height: '75%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelInitials: {
    fontSize: 20,
    fontWeight: '900',
  },
  channelNameWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  channelName: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  activeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
});
