/**
 * TvDrmPlayerScreen — Reproductor nativo para streams MPEG-DASH con ClearKey DRM
 *
 * Usa react-native-video v6 → ExoPlayer (Android) con soporte nativo de ClearKey.
 * Las claves DRM vienen como query params del videoUrl:
 *   drmKeyId=hex_key_id&drmKey=hex_key_value&drmReferer=https://...
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, BackHandler, ActivityIndicator, TouchableOpacity } from 'react-native';
import Video, { DRMType } from 'react-native-video';
import { useRoute, useNavigation } from '@react-navigation/native';
import { AlertCircle, ChevronLeft, Play, Pause, RotateCcw } from 'lucide-react-native';
import TvFocusable from '../../components/tv/TvFocusable';

const GOLD = '#B026FF';
const DIM = '#6B7280';

// ── Helpers ────────────────────────────────────────────────────────────────────
/** Convierte un string hexadecimal a Base64URL (sin padding) para ClearKey */
function hexToBase64Url(hex: string): string {
  // hex → Uint8Array → base64 → base64url
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Builds the ClearKey inline license server URI for ExoPlayer / react-native-video.
 * Format:  data:application/json,<ClearKey JSON>
 */
function buildClearKeyLicenseServer(keyIdHex: string, keyHex: string): string {
  const kid = hexToBase64Url(keyIdHex);
  const k = hexToBase64Url(keyHex);
  const json = JSON.stringify({
    keys: [{ kty: 'oct', kid, k }],
    type: 'temporary',
  });
  return 'data:application/json,' + encodeURIComponent(json);
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TvDrmPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const videoRef = useRef<any>(null);
  const { videoUrl } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const hideTimer = useRef<any>(null);

  // ── Parse URL params ───────────────────────────────────────────────────
  let cleanUrl = videoUrl ? videoUrl.trim() : '';
  if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
  else if (cleanUrl && !cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;

  let drmKeyId = '';
  let drmKey = '';
  let drmReferer = 'https://player.sensa.com.ar/';
  let drmType = '';         // 'widevine' | ''
  let drmLicenseUrl = '';   // Widevine license server
  let drmAuthToken = '';    // Widevine Bearer token
  let finalUrl = cleanUrl;

  try {
    const qIdx = cleanUrl.indexOf('?');
    if (qIdx > -1) {
      const params = new URLSearchParams(cleanUrl.slice(qIdx + 1));
      drmKeyId = params.get('drmKeyId') || '';
      drmKey = params.get('drmKey') || '';
      drmType = params.get('drmType') || '';
      drmLicenseUrl = params.get('drmLicenseUrl') ? decodeURIComponent(params.get('drmLicenseUrl')!) : '';
      drmAuthToken = params.get('drmAuthToken') ? decodeURIComponent(params.get('drmAuthToken')!) : '';
      const ref = params.get('drmReferer') || '';
      if (ref) drmReferer = decodeURIComponent(ref);
      ['drmKeyId', 'drmKey', 'drmType', 'drmLicenseUrl', 'drmAuthToken', 'drmReferer'].forEach(k => params.delete(k));
      let rest = params.toString();
      if (rest === '=' || rest === '=&') rest = '';
      finalUrl = cleanUrl.slice(0, qIdx) + (rest ? '?' + rest : '');
    }
  } catch { finalUrl = cleanUrl.split('?')[0]; }

  // strip Kodi pipe params
  if (finalUrl.includes('?|')) finalUrl = finalUrl.split('?|')[0];
  if (finalUrl.endsWith('?')) finalUrl = finalUrl.slice(0, -1);

  console.log('[DrmPlayer] url:', finalUrl);
  console.log('[DrmPlayer] drmType:', drmType || (drmKeyId ? 'clearkey' : 'none'));

  // ── DRM config for react-native-video ──────────────────────────────────
  let drmConfig: any = undefined;
  if (drmType === 'widevine' && drmLicenseUrl) {
    // Flow / Widevine — license server with Bearer auth
    drmConfig = {
      type: DRMType.WIDEVINE,
      licenseServer: drmLicenseUrl,
      headers: {
        Authorization: drmAuthToken.startsWith('Bearer') ? drmAuthToken : `Bearer ${drmAuthToken}`,
        Referer: drmReferer,
        Origin: drmReferer.replace(/\/$/, ''),
      },
    };
  } else if (drmKeyId && drmKey) {
    // Sensa / ClearKey — inline key bytes
    drmConfig = {
      type: DRMType.CLEARKEY,
      licenseServer: buildClearKeyLicenseServer(drmKeyId, drmKey),
      headers: {
        Referer: drmReferer,
        Origin: drmReferer.replace(/\/$/, ''),
      },
    };
  }

  // ── Back handler ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => { navigation.goBack(); return true; };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [navigation]);

  // ── Controls auto-hide ─────────────────────────────────────────────────
  const showControlsTemp = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  // ── Timeout fallback ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          setHasError(true);
          setErrorMsg('El canal no cargó en 45s. Verificá tu conexión o el canal puede estar offline.');
          return false;
        }
        return prev;
      });
    }, 45000);
    return () => clearTimeout(t);
  }, []);

  if (!finalUrl) {
    return (
      <View style={styles.errorFull}>
        <AlertCircle color={GOLD} size={64} />
        <Text style={styles.errorTitle}>Sin URL de video</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Video Player ── */}
      <Video
        ref={videoRef}
        source={{ uri: finalUrl, headers: { Referer: drmReferer } }}
        drm={drmConfig}
        style={StyleSheet.absoluteFillObject}
        resizeMode="contain"
        paused={isPaused}
        onLoad={() => {
          setIsLoading(false);
          setHasError(false);
        }}
        onLoadStart={() => setIsLoading(true)}
        onReadyForDisplay={() => setIsLoading(false)}
        onError={(e: any) => {
          const code = e?.error?.errorString || e?.error?.code || JSON.stringify(e?.error || e);
          console.log('[DrmPlayer] Error:', code);
          setHasError(true);
          setIsLoading(false);
          setErrorMsg(`Error de reproducción: ${code}`);
        }}
        onBuffer={({ isBuffering }: { isBuffering: boolean }) => setIsLoading(isBuffering)}
        controls={false}
        playInBackground={false}
        ignoreSilentSwitch="ignore"
        reportBandwidth={false}
      />

      {/* ── Loading overlay ── */}
      {isLoading && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.loadingText}>CARGANDO CANAL...</Text>
          <Text style={styles.loadingDetail}>{finalUrl.split('/').pop()?.split('?')[0] || ''}</Text>
        </View>
      )}

      {/* ── Error overlay ── */}
      {hasError && (
        <View style={styles.errorOverlay}>
          <AlertCircle color="#EF4444" size={52} />
          <Text style={styles.errorTitle}>Error de reproducción</Text>
          <Text style={styles.errorDetail}>{errorMsg}</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 24 }}>
            <TvFocusable
              onPress={() => {
                setHasError(false);
                setIsLoading(true);
                setErrorMsg('');
              }}
              hasTVPreferredFocus
              style={styles.errBtn}
              focusedStyle={styles.errBtnFocused}
            >
              {(f: boolean) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <RotateCcw color={f ? '#000' : GOLD} size={16} />
                  <Text style={[styles.errBtnTxt, f && { color: '#000' }]}>Reintentar</Text>
                </View>
              )}
            </TvFocusable>
            <TvFocusable
              onPress={() => navigation.goBack()}
              style={styles.errBtn}
              focusedStyle={styles.errBtnFocused}
            >
              {(f: boolean) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ChevronLeft color={f ? '#000' : DIM} size={16} />
                  <Text style={[styles.errBtnTxt, { color: f ? '#000' : DIM }]}>Volver</Text>
                </View>
              )}
            </TvFocusable>
          </View>
        </View>
      )}

      {/* ── Controls (tap to show) ── */}
      {!hasError && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={showControlsTemp}
        >
          {showControls && (
            <View style={styles.controls}>
              <TvFocusable
                onPress={() => navigation.goBack()}
                style={styles.ctrlBack}
                borderWidth={0}
              >
                {(f: boolean) => <ChevronLeft color={f ? GOLD : '#fff'} size={26} />}
              </TvFocusable>

              <TvFocusable
                hasTVPreferredFocus
                onPress={() => setIsPaused(p => !p)}
                style={styles.playBtn}
                focusedStyle={styles.playBtnFocused}
              >
                {(f: boolean) => isPaused
                  ? <Play color={f ? '#000' : GOLD} size={28} />
                  : <Pause color={f ? '#000' : GOLD} size={28} />
                }
              </TvFocusable>

              {/* DRM info badge */}
              {drmKeyId && (
                <View style={styles.drmBadge}>
                  <Text style={styles.drmText}>🔐 ClearKey DRM</Text>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050a0f',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  loadingText: {
    color: GOLD, fontWeight: '900', fontSize: 16,
    marginTop: 16, letterSpacing: 3, textTransform: 'uppercase',
  },
  loadingDetail: { color: DIM, fontSize: 11, marginTop: 6 },
  errorFull: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: 32,
  },
  errorTitle: { color: '#EF4444', fontSize: 20, fontWeight: '900', marginTop: 16 },
  errorDetail: { color: '#9CA3AF', fontSize: 12, marginTop: 8, textAlign: 'center', maxWidth: '75%' },
  errBtn: {
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(250,204,21,0.3)',
  },
  errBtnFocused: { backgroundColor: GOLD, borderColor: GOLD },
  errBtnTxt: { color: GOLD, fontSize: 14, fontWeight: '800' },
  // Controls
  controls: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlBack: {
    position: 'absolute',
    top: 24,
    left: 24,
    padding: 10,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(250,204,21,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(250,204,21,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnFocused: { backgroundColor: GOLD, borderColor: GOLD },
  drmBadge: {
    position: 'absolute',
    top: 24,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  drmText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
});
