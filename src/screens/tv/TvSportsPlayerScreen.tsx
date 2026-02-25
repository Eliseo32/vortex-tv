/**
 * TvSportsPlayerScreen.tsx
 * Reproductor deportivo para Android TV
 *
 * Arquitectura dual:
 *  - URL directa (.m3u8 / .mp4 / .mpd) → TvExoPlayer (ExoPlayer nativo)
 *  - URL iframe embed → WebView con Chrome Desktop UA
 *    → onShouldStartLoadWithRequest intercepta si navega a .m3u8
 *    → pasa al modo ExoPlayer en caliente
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Trophy, RefreshCw, SkipForward } from 'lucide-react-native';
import { useKeepAwake } from 'expo-keep-awake';
import TvExoPlayer from '../../components/tv/TvExoPlayer';

const SPORT_ACCENT = '#22c55e';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isDirectStream(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mpd');
}

// ─── WebView con intercepción m3u8 ───────────────────────────────────────────
interface SportWebViewProps {
  url: string;
  onM3u8Detected: (m3u8Url: string) => void;
  onNextServer: () => void;
  currentServerIndex: number;
  serverCount: number;
  title: string;
  isLocked: boolean;
}

function SportWebView({ url, onM3u8Detected, onNextServer, currentServerIndex, serverCount, title, isLocked }: SportWebViewProps) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsVideoPlaying(false);
    timeoutRef.current = setTimeout(() => setIsVideoPlaying(true), 25000);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [url]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleShouldStartLoad = (request: any): boolean => {
    const reqUrl: string = request.url || '';
    const lower = reqUrl.toLowerCase();

    // ✅ Intercepción: si el WebView quiere navegar a un m3u8 → ExoPlayer
    if (lower.includes('.m3u8') || lower.includes('.m3u')) {
      console.log('[SportsPlayer] M3U8 interceptado → ExoPlayer:', reqUrl);
      onM3u8Detected(reqUrl);
      return false; // Bloquear navegación en WebView
    }

    // Bloquear ads y redirects
    if (lower.includes('adcash') || lower.includes('popads') || lower.includes('vimeus')) return false;
    if (reqUrl.startsWith('intent://') || reqUrl.startsWith('market://')) return false;

    // Bloquear redirects de top-frame fuera del dominio original
    if (isLocked && request.isTopFrame) {
      const originalDomain = url.split('/')[2];
      if (originalDomain && !lower.includes(originalDomain) && !lower.includes('about:blank')) {
        return false;
      }
    }
    return true;
  };

  const injectedJS = `
        (function() {
            document.body.style.backgroundColor = '#000';
            document.body.style.overflow = 'hidden';
            window.open = function() { return null; };
            window.alert = function() { return null; };
            window.confirm = function() { return null; };

            let notified = false;
            const notify = (el) => {
                if (notified) return;
                notified = true;
                try { window.ReactNativeWebView.postMessage('playing'); } catch(e) {}
                if (el) {
                    el.style.position = 'fixed'; el.style.top = '0'; el.style.left = '0';
                    el.style.width = '100vw'; el.style.height = '100vh';
                    el.style.zIndex = '99999999'; el.style.objectFit = 'contain';
                    try { el.muted = false; el.volume = 1; } catch(e) {}
                }
            };

            let attempts = 0;
            const tick = setInterval(() => {
                if (notified || ++attempts > 60) { clearInterval(tick); return; }
                const v = document.querySelector('video');
                const f = document.querySelector('iframe');
                if (v) {
                    if (!v.hasAttribute('data-hooked')) {
                        v.setAttribute('data-hooked', '1');
                        v.addEventListener('playing', () => notify(v));
                        v.addEventListener('timeupdate', () => { if (v.currentTime > 0.1) notify(v); });
                    }
                    if (!v.paused && v.currentTime > 0.1) notify(v);
                }
                if (f && !v) {
                    f.style.position = 'fixed'; f.style.top = '0'; f.style.left = '0';
                    f.style.width = '100vw'; f.style.height = '100vh';
                    f.style.zIndex = '999999'; f.style.border = 'none';
                    if (attempts > 5) notify(null);
                }
                // Auto-click para arrancar reproductores
                if (attempts % 3 === 0) {
                    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                    document.elementFromPoint(cx, cy)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
                }
            }, 800);

            // Bloquear Enter en TV para evitar clicks en ads
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 66) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    const v = document.querySelector('video');
                    if (v) { if (v.paused) v.play(); else v.pause(); }
                }
            }, true);
        })();
        true;
    `;

  const isWaiting = !isVideoPlaying;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {isWaiting && (
        <View style={styles.waitScreen}>
          <View style={styles.waitBox}>
            <View style={styles.liveRow}>
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
              <Text style={styles.liveText}>CONECTANDO</Text>
            </View>
            <Text style={styles.waitTitle} numberOfLines={2}>{title}</Text>
            <Text style={styles.waitSub}>Servidor {currentServerIndex + 1} de {serverCount}</Text>
            {currentServerIndex > 0 && (
              <View style={styles.switchRow}>
                <RefreshCw color="#FACC15" size={12} />
                <Text style={styles.switchText}>Buscando mejor señal...</Text>
              </View>
            )}
          </View>
        </View>
      )}
      <WebView
        key={`wv-${currentServerIndex}`}
        source={{ uri: url }}
        style={{ flex: 1, opacity: isWaiting ? 0 : 1, backgroundColor: '#000' }}
        userAgent={CHROME_UA}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        domStorageEnabled
        javaScriptEnabled
        androidLayerType="hardware"
        mixedContentMode="always"
        injectedJavaScript={injectedJS}
        injectedJavaScriptForMainFrameOnly={false}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        onMessage={(e) => { if (e.nativeEvent.data === 'playing') setIsVideoPlaying(true); }}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
      />
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function TvSportsPlayerScreen() {
  useKeepAwake();

  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { item } = route.params || {};
  const { title = 'Deportes en Vivo', videoUrl = '', servers = [] } = item || {};

  // Construir lista de servidores como array de strings
  const urlList: string[] = (() => {
    if (servers.length > 0) {
      if (typeof servers[0] === 'string') return servers as string[];
      if (typeof servers[0] === 'object' && servers[0].url) return servers.map((s: any) => s.url);
    }
    return videoUrl ? [videoUrl] : [];
  })();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [interceptedM3u8, setInterceptedM3u8] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const currentUrl = interceptedM3u8 || urlList[currentIndex] || '';
  const useExo = isDirectStream(currentUrl);

  useEffect(() => {
    setInterceptedM3u8(null);
    setIsLocked(false);
    const t = setTimeout(() => setIsLocked(true), 2000);
    return () => clearTimeout(t);
  }, [currentIndex]);

  const handleNextServer = () => {
    if (currentIndex < urlList.length - 1) {
      setCurrentIndex(i => i + 1);
    }
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack(); return true;
    });
    return () => sub.remove();
  }, [navigation]);

  if (!currentUrl) {
    return (
      <View style={styles.centered}>
        <Trophy color={SPORT_ACCENT} size={54} />
        <Text style={styles.noUrl}>Sin stream disponible</Text>
      </View>
    );
  }

  // ── Servidor agotados ──────────────────────────────────────────────────
  if (currentIndex >= urlList.length) {
    return (
      <View style={styles.centered}>
        <Trophy color="#ef4444" size={54} />
        <Text style={styles.noUrl}>Sin más servidores disponibles</Text>
      </View>
    );
  }

  // ── ExoPlayer para streams directos (m3u8 interceptado o URL directa) ──
  if (useExo) {
    return (
      <TvExoPlayer
        url={currentUrl}
        title={title}
        serverIndex={currentIndex}
        serverCount={urlList.length}
        accentColor={SPORT_ACCENT}
        onNextServer={currentIndex < urlList.length - 1 ? handleNextServer : undefined}
        onBack={() => navigation.goBack()}
      />
    );
  }

  // ── WebView con intercepción m3u8 ──────────────────────────────────────
  return (
    <SportWebView
      url={currentUrl}
      title={title}
      currentServerIndex={currentIndex}
      serverCount={urlList.length}
      isLocked={isLocked}
      onM3u8Detected={(m3u8) => setInterceptedM3u8(m3u8)}
      onNextServer={handleNextServer}
    />
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center' },
  noUrl: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 20 },

  waitScreen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  waitBox: { backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', borderRadius: 20, padding: 32, alignItems: 'center', minWidth: 320 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(34,197,94,0.1)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 16 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: SPORT_ACCENT },
  liveText: { color: SPORT_ACCENT, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  waitTitle: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  waitSub: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: 'rgba(250,204,21,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  switchText: { color: '#FACC15', fontSize: 11, fontWeight: '700' },
});
