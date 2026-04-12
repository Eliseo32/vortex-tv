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
  View, Text, StyleSheet, Animated, BackHandler, StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Trophy, RefreshCw, ArrowLeft } from 'lucide-react-native';
import { useKeepAwake } from 'expo-keep-awake';
import TvExoPlayer from '../../components/tv/TvExoPlayer';
import TvFocusable from '../../components/tv/TvFocusable';

const SPORT_ACCENT = '#22c55e';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Bloqueador de anuncios potente (antes de cargar)
const AD_BLOCKER_BEFORE_LOAD = `
(function(){
  var AD = ['doubleclick','googlesyndication','adnxs','popads','popcash',
    'exoclick','propellerads','adsterra','monetag','adcash','trafficjunky',
    'trafficstars','juicyads','hilltopads','clickadu','pushground','yllix',
    'admaven','richpush','evadav','adskeeper','popunder'];
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, url) {
    if (typeof url === 'string' && AD.some(function(d){ return url.indexOf(d) !== -1; })) return;
    return _open.apply(this, arguments);
  };
  var _fetch = window.fetch;
  window.fetch = function(url) {
    if (typeof url === 'string' && AD.some(function(d){ return url.indexOf(d) !== -1; }))
      return Promise.resolve(new Response('', {status:200}));
    return _fetch.apply(this, arguments);
  };
  window.open = function(){ return null; };
  window.alert = function(){ return true; };
  window.confirm = function(){ return true; };
  window.prompt = function(){ return ''; };
})(); true;
`;

// Limpieza de ads en DOM + unmute + autoplay agresivo
const SPORTS_AFTER_LOAD_JS = `
(function(){
  document.body.style.backgroundColor = '#000';
  document.body.style.overflow = 'hidden';
  var AD_SEL = [
    'ins.adsbygoogle','[class*="adsbygoogle"]','[id*="google_ads"]',
    'iframe[src*="doubleclick"]','iframe[src*="exoclick"]','iframe[src*="adsterra"]',
    '[id*="popup"]:not([class*="player"])', '[class*="popup"]:not([class*="player"])',
    '.adbox','.adbanner','.ad-container','.ad-overlay','[data-ad]',
  ];
  function cleanAds() {
    AD_SEL.forEach(function(sel) {
      try { document.querySelectorAll(sel).forEach(function(el) {
        if (!el.querySelector('video') && !el.closest('[class*="player"]')) el.remove();
      }); } catch(e){}
    });
  }
  cleanAds();
  new MutationObserver(cleanAds).observe(document.documentElement, { childList:true, subtree:true });

  function forceUnmute() {
    try { ['player','clappr','cp','p'].forEach(function(n){ var p=window[n]; if(p&&typeof p.setVolume==='function') p.setVolume(100); }); } catch(e){}
    try { if(window.jwplayer) { window.jwplayer().setMute(false); window.jwplayer().setVolume(100); } } catch(e){}
    try { var v=document.querySelector('video'); if(v){ v.muted=false; v.volume=1; } } catch(e){}
  }

  var attempts = 0, notified = false;
  var interval = setInterval(function(){
    if (++attempts > 80) { clearInterval(interval); return; }
    
    // Forzar pantalla completa mediante CSS duro
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    forceUnmute();
    var v = document.querySelector('video'), f = document.querySelector('iframe');
    
    // Si hay un iframe pero no hay video, hacer fullscreen el iframe
    if (f && !v) {
      f.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; width:100vw !important; height:100vh !important; z-index:999999 !important; border:none !important; background:#000 !important; margin:0 !important; padding:0 !important;';
      if (attempts>4&&!notified){ notified=true; try{ window.ReactNativeWebView.postMessage('playing'); }catch(e){} }
    }
    
    if (v) {
      // Intentar forzar estilos en contenedores padres de video comunes
      try {
        var p = v.closest('[class*="player"]') || v.parentElement;
        if (p) p.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; width:100vw !important; height:100vh !important; z-index:999998 !important; background:#000 !important; margin:0 !important; padding:0 !important;';
      } catch(e){}
      
      // Forzar fullscreen CSS al elemento video directamente
      v.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; width:100vw !important; height:100vh !important; z-index:999999 !important; background:#000 !important; object-fit:contain !important; margin:0 !important; padding:0 !important;';

      // Forzar atributos de autoplay
      if (!v.__hooked) {
        v.__hooked = true;
        v.setAttribute('autoplay', '');
        v.setAttribute('playsinline', '');
        v.muted = false;
        v.volume = 1;
        v.addEventListener('playing', function(){ if(!notified){ notified=true; try{ window.ReactNativeWebView.postMessage('playing'); }catch(e){} } });
        v.addEventListener('timeupdate', function(){ if(v.currentTime>0.1&&!notified){ notified=true; try{ window.ReactNativeWebView.postMessage('playing'); }catch(e){} } });
      }
      // Intentar play durante los primeros 30 ciclos (~24 segundos)
      if (attempts<=30 && v.paused) {
        try{ v.play().catch(function(){}); }catch(e){}
      }
    }
    
    // Clics en botones de play durante los primeros 15 ciclos (~12 segundos)
    if (attempts<=15) {
      ['.vjs-big-play-button','.jw-icon-display','.plyr__control--overlaid','.sound-button',
       '[aria-label="Play"]','[title="Play"]','.play-btn','.play-button'].forEach(function(sel){
        var b=document.querySelector(sel); if(b) try{ b.click(); }catch(e){}
      });
    }
    if (v&&!v.paused&&v.currentTime>0.1) clearInterval(interval);
  }, 800);
})(); true;
`;


// ─── WebView con intercepción m3u8 ───────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getDomainReferer(url: string): string {
  try { const u = new URL(url); return `${u.protocol}//${u.host}/`; }
  catch { return 'https://angulismotv-dnh.pages.dev/'; }
}

function isDirectStream(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mpd');
}

interface SportWebViewProps {
  url: string;
  onM3u8Detected: (m3u8Url: string) => void;
  onNextServer: () => void;
  onVideoPlaying: () => void;   // ← callback al padre para fade del badge
  currentServerIndex: number;
  serverCount: number;
  title: string;
  isLocked: boolean;
}

function SportWebView({ url, onM3u8Detected, onNextServer, onVideoPlaying, currentServerIndex, serverCount, title, isLocked }: SportWebViewProps) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [retryNoReferer, setRetryNoReferer] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsVideoPlaying(false);
    setRetryNoReferer(false);
    // Si en 30s no detecta video, reintenta sin Referer (por si el servidor rechaza el origin)
    retryRef.current = setTimeout(() => setRetryNoReferer(true), 30000);
    // Timeout de 55s para mostrar overlay de "parece que está cargando"
    timeoutRef.current = setTimeout(() => setIsVideoPlaying(true), 55000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
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
    const AD_DOMAINS = ['adcash','popads','vimeus','doubleclick','googlesyndication','exoclick','trafficjunky','propellerads','adsterra','monetag','clickadu'];
    if (AD_DOMAINS.some(d => lower.includes(d))) return false;
    if (reqUrl.startsWith('intent://') || reqUrl.startsWith('market://')) return false;
    if (lower.includes('apk') || lower.includes('.exe')) return false;
    return true;
  };

  const isWaiting = !isVideoPlaying;

  // Headers: primero con Referer, si falla reintenta sin headers (algunos servidores bloquean por Origin)
  const webViewSource = retryNoReferer
    ? { uri: url }
    : {
        uri: url,
        headers: {
          'Referer': getDomainReferer(url),
          'Origin': getDomainReferer(url).replace(/\/$/, ''),
          'X-Requested-With': '',
        }
      };

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
            {retryNoReferer && (
              <View style={styles.switchRow}>
                <RefreshCw color="#B026FF" size={12} />
                <Text style={styles.switchText}>Reintentando sin restricciones...</Text>
              </View>
            )}
            {!retryNoReferer && currentServerIndex > 0 && (
              <View style={styles.switchRow}>
                <RefreshCw color="#B026FF" size={12} />
                <Text style={styles.switchText}>Buscando mejor señal...</Text>
              </View>
            )}
          </View>
        </View>
      )}
      <WebView
        key={`wv-${currentServerIndex}-${retryNoReferer ? 'no-ref' : 'ref'}`}
        source={webViewSource}
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
        injectedJavaScriptBeforeContentLoaded={AD_BLOCKER_BEFORE_LOAD}
        injectedJavaScript={SPORTS_AFTER_LOAD_JS}
        injectedJavaScriptForMainFrameOnly={false}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        onMessage={(e) => {
          if (e.nativeEvent.data === 'playing') {
            setIsVideoPlaying(true);
            onVideoPlaying();   // ← avisa al padre para que haga fade del badge
            if (retryRef.current) clearTimeout(retryRef.current);
          }
        }}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
      />
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function TvSportsPlayerScreen() {
  useKeepAwake();

  // ── Ocultar status bar + modo inmersivo al entrar al reproductor ──────────
  useEffect(() => {
    StatusBar.setHidden(true, 'none');
    return () => StatusBar.setHidden(false, 'fade');
  }, []);
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

  // Badge fade
  const badgeOpacity = useRef(new Animated.Value(1)).current;
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Auto-hide badge after video plays
  const handleVideoPlaying = () => {
    badgeTimer.current = setTimeout(() => {
      Animated.timing(badgeOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start();
    }, 4000);
  };

  const handleNextServer = () => {
    if (currentIndex < urlList.length - 1) {
      setCurrentIndex(i => i + 1);
      badgeOpacity.setValue(1);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
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

  // ── WebView + badge flotante ───────────────────────────────────────────
  const serverOptions = urlList.map((u, i) => ({ name: `Servidor ${i + 1}`, url: u }));

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <SportWebView
        url={currentUrl}
        title={title}
        currentServerIndex={currentIndex}
        serverCount={urlList.length}
        isLocked={isLocked}
        onM3u8Detected={(m3u8) => setInterceptedM3u8(m3u8)}
        onNextServer={handleNextServer}
        onVideoPlaying={handleVideoPlaying}
      />

      {/* Badge flotante con back + título + siguiente servidor */}
      <Animated.View style={[styles.badge, { opacity: badgeOpacity }]} pointerEvents="box-none">
        <TvFocusable onPress={() => navigation.goBack()} borderWidth={0} scaleTo={1.1} style={{ borderRadius: 50 }} hasTVPreferredFocus={true}>
          {(f: boolean) => (
            <View style={[styles.badgeBtn, f && styles.badgeBtnFocused]}>
              <ArrowLeft color={f ? '#000' : '#fff'} size={20} />
            </View>
          )}
        </TvFocusable>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDotSmall} />
            <Text style={styles.liveIndicatorText}>EN VIVO</Text>
          </View>
          <Text numberOfLines={1} style={styles.badgeTitle}>{title}</Text>
        </View>

        {currentIndex < urlList.length - 1 && (
          <TvFocusable onPress={handleNextServer} borderWidth={0} scaleTo={1.1} style={{ borderRadius: 12 }}>
            {(f: boolean) => (
              <View style={[styles.nextBtn, f && styles.nextBtnFocused]}>
                <RefreshCw color={f ? '#fff' : SPORT_ACCENT} size={16} />
                <Text style={[styles.nextBtnText, f && { color: '#fff' }]}>Sig. señal</Text>
              </View>
            )}
          </TvFocusable>
        )}
      </Animated.View>
    </View>
  );
}

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
  switchText: { color: '#B026FF', fontSize: 11, fontWeight: '700' },

  // Badge flotante
  badge: {
    position: 'absolute', top: 20, left: 20, right: 20, zIndex: 200,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 50,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  badgeBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeBtnFocused: { backgroundColor: '#fff', borderColor: '#fff' },
  badgeTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: SPORT_ACCENT },
  liveIndicatorText: { color: SPORT_ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)',
  },
  nextBtnFocused: { backgroundColor: SPORT_ACCENT, borderColor: SPORT_ACCENT },
  nextBtnText: { color: SPORT_ACCENT, fontSize: 12, fontWeight: '800' },
});
