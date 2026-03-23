/**
 * TvChannelPlayerScreen — Reproductor para canales en vivo
 * Colecciones: canales_carpetas + channelFolders
 *
 * - WebView puro: el usuario navega con los controles nativos del reproductor web
 * - Ad-blocking potente (XHR + fetch + MutationObserver)
 * - Soporte m3u8: URLs nativas van a react-native-video
 * - Badge flotante mínimo (desaparece en 4s) con nombre del canal y botón ATRÁS
 * - Cambio de servidor cuando el folder tiene múltiples opciones
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, BackHandler, Animated,
    TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Video from 'react-native-video';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ArrowLeft, Radio, Server, RefreshCw } from 'lucide-react-native';
import TvFocusable from '../../components/tv/TvFocusable';

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Bloqueador de anuncios potente ──────────────────────────────────────────
const AD_BLOCKER_BEFORE_LOAD = `
(function(){
  var AD = ['doubleclick','googlesyndication','adnxs','popads','popcash',
    'exoclick','propellerads','adsterra','monetag','adcash','adcolony',
    'trafficjunky','trafficstars','juicyads','hilltopads','adspyglass',
    'clickadu','pushground','yllix','admaven','richpush','evadav',
    'adtelligent','adskeeper','popunder.ru','porn.hub.ad','fuckingfastcdn',
    'abtasty','hotjar','segment.io','adroll'];

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

const AFTER_LOAD_JS = `
(function(){
  document.body.style.backgroundColor = '#000';
  document.body.style.overflow = 'hidden';

  // Eliminar ads del DOM con observer continuo
  var AD_SEL = [
    'ins.adsbygoogle','[class*="adsbygoogle"]','[id*="google_ads"]',
    'iframe[src*="doubleclick"]','iframe[src*="googlesyndication"]',
    'iframe[src*="exoclick"]','iframe[src*="adsterra"]','iframe[src*="popads"]',
    '[id*="popup"]:not([class*="player"])', '[class*="popup"]:not([class*="player"])',
    '.adbox','.adbanner','.ad-container','.ad-overlay','#overlay-ad',
    '[data-ad]', '[class*="advertisement"]', 'div[id*="adsense"]',
  ];
  function cleanAds() {
    AD_SEL.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          if (!el.querySelector('video') && !el.closest('[class*="player"]') && !el.closest('[id*="player"]'))
            el.remove();
        });
      } catch(e){}
    });
  }
  cleanAds();
  new MutationObserver(cleanAds).observe(document.documentElement, { childList:true, subtree:true });

  // Forzar audio (Clappr, JW Player, video nativo, video.js)
  function forceUnmute() {
    try { ['player','clappr','cp','p','_player'].forEach(function(n){ var p=window[n]; if(p&&typeof p.setVolume==='function'){ p.setVolume(100); if(typeof p.mute==='function') p.mute(false); } }); } catch(e){}
    try { if(window.jwplayer) window.jwplayer().setMute(false), window.jwplayer().setVolume(100); } catch(e){}
    try { var v=document.querySelector('video'); if(v){ v.muted=false; v.volume=1; } } catch(e){}
    try { if(window.videojs) Object.values(window.videojs.players||{}).forEach(function(p){ if(p){ p.muted(false); p.volume(1); } }); } catch(e){}
  }

  // Auto-play y auto-unmute loop
  var attempts = 0, notified = false;
  var interval = setInterval(function(){
    if (++attempts > 80) { clearInterval(interval); return; }

    forceUnmute();

    var v = document.querySelector('video');
    var f = document.querySelector('iframe');

    if (v) {
      if (!v.__hooked) {
        v.__hooked = true;
        v.addEventListener('playing', function(){ if(!notified){ notified=true; try{ window.ReactNativeWebView.postMessage('video_playing'); }catch(e){} } });
        v.addEventListener('pause', function(){ if(notified) try{ window.ReactNativeWebView.postMessage('video_paused'); }catch(e){} });
      }
      if (!v.paused && v.currentTime > 0.1 && !notified) { notified=true; try{ window.ReactNativeWebView.postMessage('video_playing'); }catch(e){} }
      if (attempts <= 5 && v.paused) try { v.play(); } catch(e){}
    }
    if (f && !v) {
      f.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;border:none;background:#000;';
      if (attempts > 4 && !notified) { notified=true; try{ window.ReactNativeWebView.postMessage('video_playing'); }catch(e){} }
    }

    // Click en botones de big-play (sólo primeros 5 intentos)
    if (attempts <= 5) {
      ['.vjs-big-play-button','.jw-icon-display','.plyr__control--overlaid',
       '.voe-play','.play-btn','.sound-button','[class*="play"][class*="button"]',
       '.clappr-play-btn'].forEach(function(sel){
        var b = document.querySelector(sel); if(b) try{ b.click(); }catch(e){}
      });
    }

    if (v && !v.paused && v.currentTime > 0.1) clearInterval(interval);
  }, 800);

  // Mensajes de control desde React Native
  window.addEventListener('message', function(e){
    var d = e.data;
    if (d === 'CMD_UNMUTE' || d === 'CMD_VOLUME_UP') forceUnmute();
    if (d === 'CMD_MUTE') { try{ var v=document.querySelector('video'); if(v) v.muted=true; }catch(e){} }
  });
})(); true;
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isNativeStream(url: string): boolean {
    const clean = url.toLowerCase().split('?')[0];
    return clean.endsWith('.m3u8') || clean.endsWith('.mp4')
        || clean.endsWith('.ts') || clean.endsWith('.mkv');
}

function getDomainReferer(url: string): string {
    try { const u = new URL(url); return `${u.protocol}//${u.host}/`; }
    catch { return 'https://bolaloca.my/'; }
}

const BLOCKED_DOMAINS = [
    'adcash','popads','popcash','doubleclick','googlesyndication','exoclick',
    'propellerads','adsterra','monetag','popunder','trafficjunky','clickadu',
];

// ─── Componente ───────────────────────────────────────────────────────────────
export default function TvChannelPlayerScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { channel: initialChannel, folder } = route.params;

    const [channel, setChannel] = useState(initialChannel);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [showServerList, setShowServerList] = useState(false);

    // Badge fade
    const badgeOpacity = useRef(new Animated.Value(1)).current;
    const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const webViewRef = useRef<WebView>(null);

    // Normalizar URL
    let url: string = channel.videoUrl || '';
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url && !url.startsWith('http')) url = 'https://' + url;

    const useNative = isNativeStream(url);
    const folderOptions: { name: string; iframe: string }[] = folder?.options || [];

    // Back handler
    useEffect(() => {
        const h = BackHandler.addEventListener('hardwareBackPress', () => { navigation.goBack(); return true; });
        return () => h.remove();
    }, [navigation]);

    // Fail-safe loading
    useEffect(() => {
        let mounted = true;
        const t = setTimeout(() => { if (mounted) setIsVideoPlaying(true); }, useNative ? 6000 : 15000);
        return () => { mounted = false; clearTimeout(t); };
    }, [url]);

    // Auto-hide badge after 4s when video starts
    useEffect(() => {
        if (!isVideoPlaying) return;
        badgeTimer.current = setTimeout(() => {
            Animated.timing(badgeOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start();
        }, 4000);
        return () => { if (badgeTimer.current) clearTimeout(badgeTimer.current); };
    }, [isVideoPlaying]);

    const switchChannel = (opt: { name: string; iframe: string }) => {
        setShowServerList(false);
        setIsVideoPlaying(false);
        badgeOpacity.setValue(1);
        if (badgeTimer.current) clearTimeout(badgeTimer.current);
        setChannel({ ...channel, title: opt.name, videoUrl: opt.iframe });
    };

    // ── Loading Screen ────────────────────────────────────────────────────
    const LoadingScreen = () => (
        <View style={[StyleSheet.absoluteFillObject, styles.loadingBg]}>
            <Radio color="#B026FF" size={44} strokeWidth={1.5} />
            <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>EN VIVO</Text>
            </View>
            <Text style={styles.loadingTitle}>{channel.title}</Text>
            <Text style={styles.loadingHint}>Conectando señal...</Text>
        </View>
    );

    // ── Floating Badge ────────────────────────────────────────────────────
    const FloatingBadge = () => (
        <Animated.View style={[styles.badge, { opacity: badgeOpacity }]} pointerEvents="box-none">
            <TvFocusable onPress={() => navigation.goBack()} borderWidth={0} scaleTo={1.1} style={{ borderRadius: 50 }}>
                {(f: boolean) => (
                    <View style={[styles.badgeBtn, f && styles.badgeBtnFocused]}>
                        <ArrowLeft color={f ? '#000' : '#fff'} size={20} />
                    </View>
                )}
            </TvFocusable>

            <View style={styles.badgeInfo}>
                <View style={styles.badgeLive}>
                    <View style={styles.liveDotSmall} />
                    <Text style={styles.badgeLiveText}>EN VIVO</Text>
                </View>
                <Text numberOfLines={1} style={styles.badgeTitle}>{channel.title}</Text>
            </View>

            {folderOptions.length > 1 && (
                <TvFocusable onPress={() => setShowServerList(true)} borderWidth={0} scaleTo={1.1} style={{ borderRadius: 50 }}>
                    {(f: boolean) => (
                        <View style={[styles.badgeBtn, f && styles.badgeBtnFocused]}>
                            <Server color={f ? '#000' : '#B026FF'} size={18} />
                        </View>
                    )}
                </TvFocusable>
            )}
        </Animated.View>
    );

    // ── Server List Modal ─────────────────────────────────────────────────
    const ServerList = () => (
        <View style={styles.modalBg}>
            <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                    <Server color="#B026FF" size={26} />
                    <Text style={styles.modalTitle}>Cambiar Señal</Text>
                </View>
                {folderOptions.map((opt, i) => (
                    <TvFocusable key={i} onPress={() => switchChannel(opt)} borderWidth={0} scaleTo={1.04}
                        style={{ borderRadius: 12, marginBottom: 8 }} hasTVPreferredFocus={opt.iframe === url}>
                        {(f: boolean) => (
                            <View style={[styles.serverRow, f && styles.serverRowFocused]}>
                                <Radio color={f ? '#fff' : '#B026FF'} size={15} />
                                <Text style={[styles.serverName, f && { color: '#fff' }]}>{opt.name}</Text>
                                {opt.iframe === url && <View style={styles.activeDot} />}
                            </View>
                        )}
                    </TvFocusable>
                ))}
                <TvFocusable onPress={() => setShowServerList(false)} borderWidth={0} scaleTo={1.04}
                    style={{ borderRadius: 12, marginTop: 8 }}>
                    {(f: boolean) => (
                        <View style={[styles.serverRow, f && { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#ef4444' }]}>
                            <Text style={[styles.serverName, { color: f ? '#ef4444' : '#9CA3AF' }]}>Cancelar</Text>
                        </View>
                    )}
                </TvFocusable>
            </View>
        </View>
    );

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <View style={styles.root}>

            {useNative ? (
                /* ── NATIVE HLS/MP4 ─────────────────────────────── */
                <View style={StyleSheet.absoluteFillObject}>
                    {!isVideoPlaying && <LoadingScreen />}
                    <Video
                        source={{ uri: url }}
                        style={StyleSheet.absoluteFillObject}
                        resizeMode="contain"
                        controls={true}   // Controles nativos del player
                        onLoad={() => setIsVideoPlaying(true)}
                        onError={() => setIsVideoPlaying(true)}
                        paused={false}
                        volume={1.0}
                    />
                    <FloatingBadge />
                </View>
            ) : (
                /* ── WEBVIEW ─────────────────────────────────────── */
                <View style={StyleSheet.absoluteFillObject}>
                    {!isVideoPlaying && <LoadingScreen />}

                    <WebView
                        ref={webViewRef}
                        source={{
                            uri: url,
                            headers: {
                                'Referer': getDomainReferer(url),
                                'Origin': getDomainReferer(url).replace(/\/$/, ''),
                                'X-Requested-With': '',
                            },
                        }}
                        userAgent={CHROME_UA}
                        style={{ flex: 1, backgroundColor: '#000', opacity: isVideoPlaying ? 1 : 0 }}
                        allowsFullscreenVideo
                        allowsInlineMediaPlayback
                        mediaPlaybackRequiresUserAction={false}
                        domStorageEnabled
                        javaScriptEnabled
                        thirdPartyCookiesEnabled
                        sharedCookiesEnabled
                        androidLayerType="hardware"
                        mixedContentMode="always"
                        originWhitelist={['*']}
                        setSupportMultipleWindows={false}
                        javaScriptCanOpenWindowsAutomatically={false}
                        injectedJavaScriptBeforeContentLoaded={AD_BLOCKER_BEFORE_LOAD}
                        injectedJavaScript={AFTER_LOAD_JS}
                        injectedJavaScriptForMainFrameOnly={false}
                        onMessage={(e) => {
                            if (e.nativeEvent.data === 'video_playing') setIsVideoPlaying(true);
                        }}
                        onShouldStartLoadWithRequest={(req) => {
                            const u = req.url.toLowerCase();
                            if (u.startsWith('intent://') || u.startsWith('market://')) return false;
                            if (BLOCKED_DOMAINS.some(d => u.includes(d))) return false;
                            if (u.includes('apk') || u.includes('.exe')) return false;
                            return true;
                        }}
                    />

                    <FloatingBadge />
                </View>
            )}

            {/* Server modal */}
            {showServerList && <ServerList />}
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    // Loading
    loadingBg: {
        backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', zIndex: 40,
    },
    liveBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 7,
        backgroundColor: 'rgba(176,38,255,0.15)', borderWidth: 1, borderColor: 'rgba(176,38,255,0.4)',
        paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 20,
    },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#B026FF' },
    liveText: { color: '#B026FF', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
    loadingTitle: { color: '#fff', fontWeight: '800', fontSize: 20, marginTop: 12, textAlign: 'center', maxWidth: '70%' },
    loadingHint: { color: '#6B7280', fontSize: 13, marginTop: 8 },

    // Badge flotante
    badge: {
        position: 'absolute', top: 20, left: 20, right: 20, zIndex: 200,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
        alignSelf: 'flex-start',
    },
    badgeBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    badgeBtnFocused: { backgroundColor: '#fff', borderColor: '#fff' },
    badgeInfo: { flex: 1, gap: 2 },
    badgeLive: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#B026FF' },
    badgeLiveText: { color: '#B026FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
    badgeTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },

    // Server modal
    modalBg: {
        ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    },
    modalCard: {
        width: 460, backgroundColor: '#0a0a0d', borderRadius: 24, padding: 28,
        borderWidth: 1, borderColor: 'rgba(176,38,255,0.25)',
    },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    modalTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
    serverRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#111115',
    },
    serverRowFocused: { backgroundColor: '#B026FF', borderColor: '#B026FF' },
    serverName: { color: '#e4e4e7', fontSize: 15, fontWeight: '700', flex: 1 },
    activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#B026FF' },
});
