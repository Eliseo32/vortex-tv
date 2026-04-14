/**
 * TvSportsPlayerScreen.tsx — v3.0
 * Reproductor deportivo completo para Android TV
 *
 * Controles D-pad:
 *   BACK      → si overlay oculto: muestra overlay
 *               si overlay visible: navega atrás
 *               si menú calidad abierto: cierra menú
 *
 * Overlay de controles (aparece al inicio, se oculta al 4s, Back lo muestra):
 *   [← Atrás]  [▶/⏸ Play]  [⚙ Calidad ▾]  [↻ Sig. señal]
 *
 * Comandos JW Player vía injectJavaScript broadcasteado a todos los iframes.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, BackHandler, StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  Trophy, RefreshCw, ArrowLeft, Play, Pause, Settings, Check,
} from 'lucide-react-native';
import { useKeepAwake } from 'expo-keep-awake';
import TvExoPlayer from '../../components/tv/TvExoPlayer';
import TvFocusable from '../../components/tv/TvFocusable';

// ─── Constantes ───────────────────────────────────────────────────────────────
const SPORT_ACCENT = '#22c55e';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type QualityLevel = { label: string; bitrate?: number; index: number };
type PlayerState = {
  isPlaying: boolean;
  qualities: QualityLevel[];
  currentQuality: number;
};

// ─── Ad Blocker (inyectado antes de cargar) ───────────────────────────────────
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

  // ─ Hook JW Player: forzar autostart antes de que se inicialice ─
  var _jw_raw = null;
  Object.defineProperty(window, 'jwplayer', {
    configurable: true,
    enumerable:   true,
    get: function(){ return _jw_raw; },
    set: function(jwp){
      _jw_raw = function(id){
        var inst = jwp(id);
        var _setup = inst.setup;
        inst.setup = function(cfg){
          cfg = cfg || {};
          cfg.autostart = true;   // ← forzar autoplay
          cfg.mute      = false;  // ← sin mute
          return _setup.call(this, cfg);
        };
        return inst;
      };
      // Copiar propiedades estáticas de jwplayer
      try{ Object.keys(jwp).forEach(function(k){ try{ _jw_raw[k]=jwp[k]; }catch(e){} }); }catch(e){}
    }
  });
})(); true;
`;

// ─── JS principal inyectado en cada frame ────────────────────────────────────
const SPORTS_AFTER_LOAD_JS = `
(function(){
  // Estilos base
  document.body.style.backgroundColor = '#000';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  // Limpieza de ads
  var AD_SEL = [
    'ins.adsbygoogle','[class*="adsbygoogle"]','[id*="google_ads"]',
    'iframe[src*="doubleclick"]','iframe[src*="exoclick"]','iframe[src*="adsterra"]',
    '[id*="popup"]:not([class*="player"])','[class*="popup"]:not([class*="player"])',
    '.adbox','.adbanner','.ad-container','.ad-overlay','[data-ad]',
  ];
  function cleanAds() {
    AD_SEL.forEach(function(sel){
      try { document.querySelectorAll(sel).forEach(function(el){
        if (!el.querySelector('video') && !el.closest('[class*="player"]')) el.remove();
      }); } catch(e){}
    });
  }
  cleanAds();
  new MutationObserver(cleanAds).observe(document.documentElement,{childList:true,subtree:true});

  // Comunicación con React Native
  function send(obj){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }catch(e){} }

  // Forzar audio
  function forceUnmute(){
    try{ ['player','clappr','cp','p'].forEach(function(n){
      var p=window[n]; if(p&&typeof p.setVolume==='function') p.setVolume(100);
    }); }catch(e){}
    try{ if(window.jwplayer){ window.jwplayer().setMute(false); window.jwplayer().setVolume(100); } }catch(e){}
    try{ var v=document.querySelector('video'); if(v){ v.muted=false; v.volume=1; } }catch(e){}
  }

  // Enviar calidades al RN
  function sendQualities(){
    try{
      var jw=jwplayer();
      var levels=jw.getQualityLevels();
      var current=jw.getCurrentQuality();
      if(levels&&levels.length>0){
        send({type:'qualities',levels:levels,current:current});
        return true;
      }
    }catch(e){}
    return false;
  }

  // Activar pantalla completa
  function setFullscreen(){
    try{ jwplayer().setFullscreen(true); return; }catch(e){}
    try{ document.querySelector('[aria-label="Pantalla Completa"]').click(); return; }catch(e){}
    try{ document.querySelector('.jw-icon-fullscreen').click(); return; }catch(e){}
    try{
      var el=document.querySelector('video')||document.documentElement;
      if(el.requestFullscreen) el.requestFullscreen();
    }catch(e){}
  }

  var attempts=0, notified=false, qualitiesSent=false, fullscreenSet=false;
  var interval=setInterval(function(){
    if(++attempts>80){ clearInterval(interval); return; }

    document.body.style.margin='0';
    document.body.style.overflow='hidden';
    document.documentElement.style.overflow='hidden';
    forceUnmute();

    var v=document.querySelector('video'), f=document.querySelector('iframe');

    // Iframe sin video: forzar fullscreen CSS
    if(f&&!v){
      f.style.cssText='position:fixed !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;z-index:999999 !important;border:none !important;background:#000 !important;margin:0 !important;';
      if(attempts>4&&!notified){ notified=true; send({type:'playing'}); }
    }

    if(v){
      // Forzar fullscreen CSS en contenedor y video
      try{
        var p=v.closest('[class*="player"]')||v.parentElement;
        if(p) p.style.cssText='position:fixed !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;z-index:999998 !important;background:#000 !important;margin:0 !important;';
      }catch(e){}
      v.style.cssText='position:fixed !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;z-index:999999 !important;background:#000 !important;object-fit:contain !important;margin:0 !important;';

      if(!v.__hooked){
        v.__hooked=true;
        v.setAttribute('autoplay','');
        v.setAttribute('playsinline','');
        v.muted=false; v.volume=1;

        v.addEventListener('playing',function(){
          if(!notified){ notified=true; send({type:'playing'}); }
          // Auto fullscreen al primer play
          if(!fullscreenSet){ fullscreenSet=true; setTimeout(setFullscreen,800); }
          // Pedir calidades
          if(!qualitiesSent){ qualitiesSent=true; setTimeout(sendQualities,2000); }
        });
        v.addEventListener('timeupdate',function(){
          if(v.currentTime>0.1&&!notified){ notified=true; send({type:'playing'}); }
        });
        v.addEventListener('pause',function(){ send({type:'paused'}); });
      }

      if(attempts<=30&&v.paused){
        try{ v.play().catch(function(){}); }catch(e){}
      }
    }

    // Click en botones de play (primeros 15 ciclos ~12s)
    if(attempts<=15){
      ['.vjs-big-play-button','.jw-icon-display','.jw-display-icon-display',
       '.plyr__control--overlaid','.sound-button',
       '[aria-label="Play"]','[aria-label="Reproducir"]','[title="Play"]',
       '.play-btn','.play-button'].forEach(function(sel){
        var b=document.querySelector(sel); if(b) try{ b.click(); }catch(e){}
      });
    }

    if(v&&!v.paused&&v.currentTime>0.1) clearInterval(interval);
  },800);

  // ─ Intervalo agresivo: llamar jwplayer().play() hasta que reproduzca ─
  var _playTry = 0;
  var _playLoop = setInterval(function(){
    _playTry++;
    if (_playTry > 60) { clearInterval(_playLoop); return; }
    try{
      var st = jwplayer().getState();
      if (st === 'idle' || st === 'paused') { jwplayer().play(); }
      if (st === 'playing' || st === 'buffering') { clearInterval(_playLoop); }
    } catch(e){}
  }, 1000);

  // ── Receptor de comandos desde React Native ───────────────────────────────
  function handleCommand(data){
    try{
      var cmd=JSON.parse(data);
      if(cmd.type==='toggle_play'){
        try{
          var jw=jwplayer();
          if(jw.getState()==='playing') jw.pause(); else jw.play();
        }catch(e){
          var v=document.querySelector('video');
          if(v){ if(v.paused) v.play().catch(function(){}); else v.pause(); }
        }
      }
      if(cmd.type==='set_quality'){
        try{ jwplayer().setCurrentQuality(cmd.index);
             send({type:'qualityChanged',current:cmd.index}); }catch(e){}
      }
      if(cmd.type==='set_fullscreen'){ setFullscreen(); }
      if(cmd.type==='get_qualities'){ sendQualities(); }
    }catch(e){}
  }
  window.addEventListener('message',function(e){ handleCommand(e.data); });
  document.addEventListener('message',function(e){ handleCommand(e.data); });

})(); true;
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getDomainReferer(url: string): string {
  try { const u = new URL(url); return `${u.protocol}//${u.host}/`; }
  catch { return 'https://angulismotv-dnh.pages.dev/'; }
}
function isDirectStream(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mpd');
}

// ─── SportWebView ─────────────────────────────────────────────────────────────
interface SportWebViewProps {
  url: string;
  webViewRef: React.RefObject<WebView | null>;
  onVideoPlaying: () => void;
  onPlayerMessage: (data: any) => void;
  currentServerIndex: number;
  serverCount: number;
  title: string;
}

function SportWebView({
  url, webViewRef, onVideoPlaying, onPlayerMessage,
  currentServerIndex, serverCount, title,
}: SportWebViewProps) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [retryNoReferer, setRetryNoReferer] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsVideoPlaying(false);
    setRetryNoReferer(false);
    retryRef.current   = setTimeout(() => setRetryNoReferer(true), 30000);
    timeoutRef.current = setTimeout(() => setIsVideoPlaying(true), 55000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (retryRef.current)   clearTimeout(retryRef.current);
    };
  }, [url]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const source = retryNoReferer
    ? { uri: url }
    : { uri: url, headers: {
        Referer: getDomainReferer(url),
        Origin:  getDomainReferer(url).replace(/\/$/, ''),
        'X-Requested-With': '',
      }};

  const handleShouldStartLoad = (req: any): boolean => {
    const u = (req.url || '').toLowerCase();
    const AD = ['adcash','popads','doubleclick','googlesyndication','exoclick',
                'trafficjunky','propellerads','adsterra','monetag','clickadu'];
    if (AD.some(d => u.includes(d))) return false;
    if (req.url.startsWith('intent://') || req.url.startsWith('market://')) return false;
    if (u.includes('apk') || u.includes('.exe')) return false;
    return true;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {!isVideoPlaying && (
        <View style={styles.waitScreen}>
          <View style={styles.waitBox}>
            <View style={styles.liveRow}>
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
              <Text style={styles.liveText}>CONECTANDO</Text>
            </View>
            <Text style={styles.waitTitle} numberOfLines={2}>{title}</Text>
            <Text style={styles.waitSub}>
              Servidor {currentServerIndex + 1} de {serverCount}
            </Text>
            {retryNoReferer && (
              <View style={styles.switchRow}>
                <RefreshCw color="#B026FF" size={12} />
                <Text style={styles.switchText}>Reintentando sin restricciones...</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <WebView
        focusable={false}
        ref={webViewRef as any}
        key={`wv-${currentServerIndex}-${retryNoReferer ? 'nr' : 'r'}`}
        source={source}
        style={{ flex: 1, opacity: isVideoPlaying ? 1 : 0, backgroundColor: '#000' }}
        userAgent={CHROME_UA}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        domStorageEnabled
        javaScriptEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        androidLayerType="hardware"
        mixedContentMode="always"
        injectedJavaScriptBeforeContentLoaded={AD_BLOCKER_BEFORE_LOAD}
        injectedJavaScript={SPORTS_AFTER_LOAD_JS}
        injectedJavaScriptForMainFrameOnly={false}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data.type === 'playing') {
              setIsVideoPlaying(true);
              onVideoPlaying();
              if (retryRef.current) clearTimeout(retryRef.current);
            }
            onPlayerMessage(data);
          } catch {}
        }}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
      />
    </View>
  );
}

// ─── Quality Menu ─────────────────────────────────────────────────────────────
function QualityMenu({
  qualities, currentQuality, onSelect, onClose,
}: {
  qualities: QualityLevel[];
  currentQuality: number;
  onSelect: (i: number) => void;
  onClose: () => void;
}) {
  if (!qualities.length) return null;
  return (
    <View style={styles.qualityOverlay}>
      <View style={styles.qualityCard}>
        <View style={styles.qualityHeader}>
          <Settings color={SPORT_ACCENT} size={20} />
          <Text style={styles.qualityTitle}>Calidad de Video</Text>
        </View>

        {qualities.map((q, i) => (
          <TvFocusable
            key={i}
            onPress={() => onSelect(i)}
            borderWidth={0}
            scaleTo={1.04}
            style={{ borderRadius: 10, marginBottom: 6 }}
            hasTVPreferredFocus={i === currentQuality}
          >
            {(f: boolean) => (
              <View style={[styles.qualityRow, f && styles.qualityRowFocused]}>
                <Text style={[styles.qualityLabel, f && { color: '#000' }]}>
                  {q.label || `Calidad ${i + 1}`}
                </Text>
                {i === currentQuality && (
                  <Check size={16} color={f ? '#000' : SPORT_ACCENT} />
                )}
              </View>
            )}
          </TvFocusable>
        ))}

        <TvFocusable
          onPress={onClose}
          borderWidth={0}
          scaleTo={1.04}
          style={{ borderRadius: 10, marginTop: 6 }}
        >
          {(f: boolean) => (
            <View style={[
              styles.qualityRow,
              f && { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#ef4444' },
            ]}>
              <Text style={[styles.qualityLabel, { color: f ? '#ef4444' : '#6B7280' }]}>
                Cancelar
              </Text>
            </View>
          )}
        </TvFocusable>
      </View>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function TvSportsPlayerScreen() {
  useKeepAwake();

  // Fullscreen inmediato al montar
  useEffect(() => {
    StatusBar.setHidden(true, 'none');
    return () => StatusBar.setHidden(false, 'fade');
  }, []);

  const route      = useRoute<any>();
  const navigation = useNavigation<any>();
  const { item }   = route.params || {};
  const { title = 'Deportes en Vivo', videoUrl = '', servers = [] } = item || {};

  // Lista de URLs / servidores
  const urlList: string[] = (() => {
    if (servers.length > 0) {
      if (typeof servers[0] === 'string') return servers as string[];
      if (typeof servers[0] === 'object' && servers[0].url)
        return servers.map((s: any) => s.url);
    }
    return videoUrl ? [videoUrl] : [];
  })();

  const [currentIndex,    setCurrentIndex]    = useState(0);
  const [interceptedM3u8, setInterceptedM3u8] = useState<string | null>(null);
  const [isLocked,        setIsLocked]        = useState(false);

  // Estado del reproductor (recibido desde JW Player vía onMessage)
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: true,
    qualities: [],
    currentQuality: 0,
  });

  // Visibilidad del overlay y del menú de calidades
  const [overlayVisible,    setOverlayVisible]    = useState(true);
  const [showQualityMenu,   setShowQualityMenu]   = useState(false);

  const webViewRef    = useRef<WebView>(null);
  const badgeOpacity  = useRef(new Animated.Value(1)).current;
  const badgeTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL normalizada
  let currentUrl = interceptedM3u8 || urlList[currentIndex] || '';
  if (currentUrl.startsWith('//'))         currentUrl = 'https:' + currentUrl;
  else if (currentUrl && !currentUrl.startsWith('http')) currentUrl = 'https://' + currentUrl;

  const useExo = isDirectStream(currentUrl);

  useEffect(() => {
    setInterceptedM3u8(null);
    setIsLocked(false);
    const t = setTimeout(() => setIsLocked(true), 2000);
    return () => clearTimeout(t);
  }, [currentIndex]);

  // ── Mostrar overlay y reiniciar timer de auto-ocultado ───────────────────
  const showOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), 6000);
  }, []);

  // ── Cuando el video empieza a reproducirse ────────────────────────────────
  const handleVideoPlaying = useCallback(() => {
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => {
      Animated.timing(badgeOpacity, {
        toValue: 0, duration: 600, useNativeDriver: true,
      }).start(() => setOverlayVisible(false));
    }, 4000);
  }, []);

  // ── Mensajes desde JW Player ──────────────────────────────────────────────
  const handlePlayerMessage = useCallback((data: any) => {
    if (data.type === 'playing') {
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
    }
    if (data.type === 'paused') {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    }
    if (data.type === 'qualities' && Array.isArray(data.levels)) {
      const levels: QualityLevel[] = data.levels.map((l: any, i: number) => ({
        label: l.label || `Calidad ${i + 1}`,
        bitrate: l.bitrate,
        index: i,
      }));
      setPlayerState(prev => ({
        ...prev, qualities: levels, currentQuality: data.current ?? 0,
      }));
    }
    if (data.type === 'qualityChanged') {
      setPlayerState(prev => ({ ...prev, currentQuality: data.current }));
    }
  }, []);

  // ── Inyectar comando a JW Player en todos los iframes ────────────────────
  const injectCommand = useCallback((cmd: object) => {
    const raw = JSON.stringify(cmd).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    webViewRef.current?.injectJavaScript(`
      (function broadcast(win, data){
        try{ win.dispatchEvent(new MessageEvent('message',{data:data})); }catch(e){}
        try{ document.dispatchEvent(new MessageEvent('message',{data:data})); }catch(e){}
        try{ Array.from(win.frames||[]).forEach(function(f){ broadcast(f,data); }); }catch(e){}
      })(window, \`${raw}\`); true;
    `);
  }, []);

  const togglePlay = useCallback(
    () => injectCommand({ type: 'toggle_play' }),
    [injectCommand]
  );

  const setQuality = useCallback((index: number) => {
    injectCommand({ type: 'set_quality', index });
    setPlayerState(prev => ({ ...prev, currentQuality: index }));
    setShowQualityMenu(false);
    showOverlay();
  }, [injectCommand, showOverlay]);

  const handleNextServer = useCallback(() => {
    if (currentIndex < urlList.length - 1) {
      setCurrentIndex(i => i + 1);
      badgeOpacity.setValue(1);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      showOverlay();
    }
  }, [currentIndex, urlList.length, showOverlay]);

  // ── BackHandler ───────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showQualityMenu)  { setShowQualityMenu(false);  return true; }
      if (!overlayVisible)  { showOverlay();               return true; }
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [navigation, showQualityMenu, overlayVisible, showOverlay]);

  // ── Sin URL disponible ─────────────────────────────────────────────────────
  if (!currentUrl) {
    return (
      <View style={styles.centered}>
        <Trophy color={SPORT_ACCENT} size={54} />
        <Text style={styles.noUrl}>Sin stream disponible</Text>
      </View>
    );
  }

  // ── ExoPlayer para streams directos (m3u8 / mpd / mp4) ───────────────────
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

  // ── Label de la calidad actual ────────────────────────────────────────────
  const qualityLabel =
    playerState.qualities[playerState.currentQuality]?.label || '';

  // ── WebView + overlay de controles ────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />

      {/* ── VIDEO ──────────────────────────────────────────────────────── */}
      <SportWebView
        url={currentUrl}
        webViewRef={webViewRef}
        title={title}
        currentServerIndex={currentIndex}
        serverCount={urlList.length}
        onVideoPlaying={handleVideoPlaying}
        onPlayerMessage={handlePlayerMessage}
      />

      {/* ── TOP BADGE: atrás + título ───────────────────────────────────── */}
      {overlayVisible && (
        <Animated.View
          style={[styles.topBadge, { opacity: badgeOpacity }]}
          pointerEvents="box-none"
        >
          <TvFocusable
            onPress={() => navigation.goBack()}
            borderWidth={0}
            scaleTo={1.1}
            style={{ borderRadius: 50 }}
            hasTVPreferredFocus={true}
          >
            {(f: boolean) => (
              <View style={[styles.iconBtn, f && styles.iconBtnFocused]}>
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
        </Animated.View>
      )}

      {/* ── BOTTOM CONTROL BAR ─────────────────────────────────────────── */}
      {overlayVisible && (
        <View style={styles.controlBar} pointerEvents="box-none">

          {/* Play / Pause */}
          <TvFocusable
            onPress={togglePlay}
            borderWidth={0}
            scaleTo={1.08}
            style={{ borderRadius: 12 }}
          >
            {(f: boolean) => (
              <View style={[styles.ctrlBtn, f && styles.ctrlBtnFocused]}>
                {playerState.isPlaying
                  ? <Pause color={f ? '#000' : '#fff'} size={18} />
                  : <Play  color={f ? '#000' : '#fff'} size={18} />
                }
                <Text style={[styles.ctrlBtnText, f && { color: '#000' }]}>
                  {playerState.isPlaying ? 'Pausar' : 'Reproducir'}
                </Text>
              </View>
            )}
          </TvFocusable>

          {/* Calidad */}
          {playerState.qualities.length > 0 && (
            <TvFocusable
              onPress={() => setShowQualityMenu(true)}
              borderWidth={0}
              scaleTo={1.08}
              style={{ borderRadius: 12 }}
            >
              {(f: boolean) => (
                <View style={[
                  styles.ctrlBtn,
                  styles.ctrlBtnQuality,
                  f && styles.ctrlBtnFocused,
                ]}>
                  <Settings color={f ? '#000' : SPORT_ACCENT} size={16} />
                  <Text style={[
                    styles.ctrlBtnText,
                    { color: f ? '#000' : SPORT_ACCENT },
                  ]}>
                    {qualityLabel || 'Calidad'}
                  </Text>
                </View>
              )}
            </TvFocusable>
          )}

          {/* Siguiente servidor */}
          {currentIndex < urlList.length - 1 && (
            <TvFocusable
              onPress={handleNextServer}
              borderWidth={0}
              scaleTo={1.08}
              style={{ borderRadius: 12 }}
            >
              {(f: boolean) => (
                <View style={[styles.ctrlBtn, f && styles.ctrlBtnFocused]}>
                  <RefreshCw color={f ? '#000' : SPORT_ACCENT} size={16} />
                  <Text style={[styles.ctrlBtnText, f && { color: '#000' }]}>
                    Sig. señal
                  </Text>
                </View>
              )}
            </TvFocusable>
          )}
        </View>
      )}

      {/* ── MENÚ DE CALIDADES ──────────────────────────────────────────── */}
      {showQualityMenu && (
        <QualityMenu
          qualities={playerState.qualities}
          currentQuality={playerState.currentQuality}
          onSelect={setQuality}
          onClose={() => setShowQualityMenu(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  centered: {
    flex: 1, backgroundColor: '#050505',
    alignItems: 'center', justifyContent: 'center',
  },
  noUrl: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 20 },

  // Loading screen
  waitScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  waitBox: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 20, padding: 32, alignItems: 'center', minWidth: 320,
  },
  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(34,197,94,0.1)',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, marginBottom: 16,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: SPORT_ACCENT },
  liveText: { color: SPORT_ACCENT, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  waitTitle: {
    color: '#fff', fontSize: 22, fontWeight: '900',
    textAlign: 'center', marginBottom: 8,
  },
  waitSub:   { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  switchText: { color: '#B026FF', fontSize: 11, fontWeight: '700' },

  // Top badge
  topBadge: {
    position: 'absolute', top: 20, left: 20, right: 20, zIndex: 200,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnFocused: { backgroundColor: '#fff', borderColor: '#fff' },
  badgeTitle:   { color: '#fff', fontSize: 14, fontWeight: '800' },
  liveIndicator:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: SPORT_ACCENT },
  liveIndicatorText: {
    color: SPORT_ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 1.5,
  },

  // Bottom control bar
  controlBar: {
    position: 'absolute', bottom: 24, left: 0, right: 0, zIndex: 200,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  ctrlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  ctrlBtnQuality: {
    borderColor: 'rgba(34,197,94,0.45)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  ctrlBtnFocused: { backgroundColor: '#fff', borderColor: '#fff' },
  ctrlBtnText:    { color: '#fff', fontSize: 13, fontWeight: '800' },

  // Quality menu
  qualityOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  },
  qualityCard: {
    width: 420,
    backgroundColor: '#0a0a0d',
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  qualityHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
  },
  qualityTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  qualityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10,
    backgroundColor: '#111115',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  qualityRowFocused: {
    backgroundColor: SPORT_ACCENT, borderColor: SPORT_ACCENT,
  },
  qualityLabel: { color: '#e4e4e7', fontSize: 15, fontWeight: '700' },
});
