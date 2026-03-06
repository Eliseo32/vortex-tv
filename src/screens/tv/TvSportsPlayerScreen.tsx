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
import { Trophy, RefreshCw } from 'lucide-react-native';
import { useKeepAwake } from 'expo-keep-awake';
import TvExoPlayer from '../../components/tv/TvExoPlayer';
import TvPlayerOverlay, { handleOverlayMessage, QualityLevel } from '../../components/tv/TvPlayerOverlay';
import F1TelemetrySidePanel from '../../components/tv/F1TelemetrySidePanel';

const SPORT_ACCENT = '#22c55e';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Dominios de AngulismoTV que son fuente válida (no hay que bloquear sus redirects)
const ANGULISMO_DOMAINS = [
  'angulismotv', 'angulismo-', 'streamtpcloud', 'streamtp10', 'la14hd',
  'nebunexa', 'elcanaldeportivo', 'bolaloca', 'welivesports', 'bestleague',
  'streamfree', 'pooembed', 'embedsports', 'viewembed', 'tucanaldeportivo',
  'envivos', 'domainplayer', 'dominioparatodo', 'streamzs', 'envivoslatam',
  'futbol.to', 'goluchitas', 'deporte-libre', 'reeeyano', 'rereyano',
];

function getDomainReferer(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return 'https://angulismotv-dnh.pages.dev/';
  }
}

function isAngulismoDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return ANGULISMO_DOMAINS.some(d => lower.includes(d));
}

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

    // Bloquear ads conocidos
    const AD_DOMAINS = ['adcash', 'popads', 'vimeus', 'doubleclick', 'googlesyndication', 'exoclick', 'trafficjunky', 'propellerads'];
    if (AD_DOMAINS.some(d => lower.includes(d))) return false;
    if (reqUrl.startsWith('intent://') || reqUrl.startsWith('market://')) return false;

    // Bloquear redirects top-frame SOLO a dominios ajenos
    if (isLocked && request.isTopFrame) {
      // Permitir dominios de AngulismoTV siempre
      if (isAngulismoDomain(reqUrl)) return true;
      // Permitir el dominio original
      const originalDomain = url.split('/')[2];
      if (originalDomain && !lower.includes(originalDomain) && !lower.includes('about:blank')) {
        return false;
      }
    }
    return true;
  };

  const injectedJS = `
        (function() {
            // === Ajuste visual ===
            document.body.style.backgroundColor = '#000';
            document.body.style.margin = '0';
            document.body.style.padding = '0';
            document.body.style.overflow = 'hidden';
            
            // === Bloquear popups ===
            window.open = function() { return null; };
            window.alert = function() { return null; };
            window.confirm = function() { return null; };

            // === Shaka Player: forzar unmute si está presente ===
            const tryShaka = () => {
                if (window.player && typeof window.player.getVolume === 'function') {
                    try { window.player.setVolume(1); window.player.configure({streaming: {}}); } catch(e) {}
                }
                // Shaka UI
                const shakaBtn = document.querySelector('.shaka-mute-button, .shaka-overflow-menu-button');
                if (shakaBtn) try { shakaBtn.click(); } catch(e) {}
            };

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
            
            const attemptUnmute = () => {
                // Botones de unmute de reproductores conocidos
                const unmuteSelectors = [
                    '.clappr-unmute', '.vjs-mute-control', '.jw-icon-vol-off', 
                    '[aria-label="Unmute"]', '[aria-label="Desactivar silencio"]',
                    '[aria-label="Quitar silencio"]', '.mute-button', '.volume-control',
                    '.plyr__control[data-plyr="mute"]', '.dplayer-volume-icon',
                    '.shaka-mute-button', 'button.unmute', '.sound-button',
                    '.jw-icon-volume', '.fp-mute', '[class*="unmute"]',
                ];
                
                // API de reproductores
                if (window.player && typeof window.player.setVolume === 'function') {
                    try { window.player.setVolume(100); } catch(e) {}
                    try { if (window.player.configure) window.player.configure({ mute: false }); } catch(e) {}
                }
                // JW Player
                if (window.jwplayer && typeof window.jwplayer === 'function') {
                    try { window.jwplayer().setMute(false); window.jwplayer().setVolume(90); } catch(e) {}
                }
                // Flowplayer
                if (window.flowplayer && window.flowplayer.instances) {
                    try { window.flowplayer.instances.forEach(p => p.unmute()); } catch(e) {}
                }
                
                unmuteSelectors.forEach(sel => {
                    const btn = document.querySelector(sel);
                    if (btn && window.getComputedStyle(btn).display !== 'none') {
                        try { btn.click(); } catch(e) {}
                    }
                });
                
                // Overlays con texto
                document.querySelectorAll('div, span, button').forEach(el => {
                    const text = ((el).innerText || '').toLowerCase();
                    if (text === 'unmute' || text === 'haz clic para activar el sonido' ||
                        text.includes('tap to unmute') || text.includes('click to unmute') ||
                        text.includes('clic para') || text.includes('sonido')) {
                        try { el.click(); } catch(e) {}
                    }
                });

                tryShaka();
            };

            const tick = setInterval(() => {
                if (notified || ++attempts > 80) { clearInterval(tick); return; }
                const v = document.querySelector('video');
                const f = document.querySelector('iframe');
                if (v) {
                    if (!v.hasAttribute('data-hooked')) {
                        v.setAttribute('data-hooked', '1');
                        v.addEventListener('playing', () => notify(v));
                        v.addEventListener('timeupdate', () => { if (v.currentTime > 0.1) notify(v); });
                        // Forzar play si está pausado
                        try { if (v.paused) { v.muted = false; v.volume = 1; v.play(); } } catch(e) {}
                    }
                    if (!v.paused && v.currentTime > 0.1) notify(v);
                }
                if (f && !v) {
                    f.style.position = 'fixed'; f.style.top = '0'; f.style.left = '0';
                    f.style.width = '100vw'; f.style.height = '100vh';
                    f.style.zIndex = '999999'; f.style.border = 'none';
                    if (attempts > 5) notify(null);
                }
                
                attemptUnmute();

                // Auto-click para activar reproductores que requieren interacción
                if (attempts % 4 === 0 && !notified) {
                    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                    const el = document.elementFromPoint(cx, cy);
                    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
                }
            }, 800);

            // Enter en TV = play/pause en el video
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
        source={{
          uri: url,
          headers: {
            // Referrer dinámico: usa el dominio de la URL del iframe para evitar bloqueos
            'Referer': getDomainReferer(url),
            'Origin': getDomainReferer(url).replace(/\/$/, ''),
            'X-Requested-With': '',
          }
        }}
        style={{ flex: 1, opacity: isWaiting ? 0 : 1, backgroundColor: '#000' }}
        userAgent={CHROME_UA}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        domStorageEnabled
        javaScriptEnabled
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
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

  // ─── Overlay state (shared controls) ───────────────────────────────────
  const [overlayCurrentTime, setOverlayCurrentTime] = useState(0);
  const [overlayDuration, setOverlayDuration] = useState(0);
  const [overlayIsPaused, setOverlayIsPaused] = useState(false);
  const [overlayQualities, setOverlayQualities] = useState<QualityLevel[]>([]);
  const webViewRef = useRef<WebView>(null);
  const [showF1Panel, setShowF1Panel] = useState(false);

  let currentUrl = interceptedM3u8 || urlList[currentIndex] || '';
  if (currentUrl && currentUrl.startsWith('//')) currentUrl = 'https:' + currentUrl;
  else if (currentUrl && !currentUrl.startsWith('http')) currentUrl = 'https://' + currentUrl;

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

  // ─── Servidores para el overlay ──────────────────────────────────────
  const serverOptions = urlList.map((url, i) => ({ name: `Servidor ${i + 1}`, url }));

  // ── WebView con intercepción m3u8 ──────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#000', flexDirection: 'row' }}>
      {/* ── VIDEO (65% o 100%) */}
      <View style={{ flex: showF1Panel ? 0.65 : 1, backgroundColor: '#000' }}>
        <SportWebView
          url={currentUrl}
          title={title}
          currentServerIndex={currentIndex}
          serverCount={urlList.length}
          isLocked={isLocked}
          onM3u8Detected={(m3u8) => setInterceptedM3u8(m3u8)}
          onNextServer={handleNextServer}
        />
        {/* Overlay de controles compartido */}
        <TvPlayerOverlay
          webViewRef={webViewRef as any}
          mode="webview"
          title={title}
          accentColor="#22c55e"
          currentTime={overlayCurrentTime}
          duration={overlayDuration}
          isPaused={overlayIsPaused}
          qualityLevels={overlayQualities}
          servers={serverOptions}
          currentServerIndex={currentIndex}
          showServerButton={urlList.length > 1}
          showF1Button={!showF1Panel}
          onF1={() => setShowF1Panel(true)}
          onBack={() => navigation.goBack()}
          onSelectServer={(i) => setCurrentIndex(i)}
        />
      </View>

      {/* ── F1 PANEL (35%) */}
      {showF1Panel && (
        <View style={{ flex: 0.35, backgroundColor: '#06080b' }}>
          <F1TelemetrySidePanel
            onClose={() => setShowF1Panel(false)}
            onFullScreen={() => {
              setShowF1Panel(false);
              navigation.navigate('F1TelemetryTV');
            }}
          />
        </View>
      )}
    </View>
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
