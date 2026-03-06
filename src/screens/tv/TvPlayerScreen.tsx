import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, BackHandler, Text, StyleSheet, Animated, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import { AlertCircle } from 'lucide-react-native';
import Video from 'react-native-video';
import { Buffer } from 'buffer';
import TvFocusable from '../../components/tv/TvFocusable';
import TvPlayerOverlay, { handleOverlayMessage, QualityLevel } from '../../components/tv/TvPlayerOverlay';

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function TvPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const webViewRef = useRef<WebView>(null);
  const { videoUrl } = route.params;

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // ── Overlay State ─────────────────────────────────────────
  const [showControls, setShowControls] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const [showOverlayTrigger, setShowOverlayTrigger] = useState(0);

  // ── Quality State ─────────────────────────────────────────
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);

  // ── Normal WebView Overlay State ────────────────────────────────────────
  const [showWebControls, setShowWebControls] = useState(false);
  const webControlsOpacity = useRef(new Animated.Value(0)).current;
  const webControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── URL Parsing ─────────────────────────────────────────────────────────
  let cleanUrl = videoUrl ? videoUrl.trim() : '';
  if (cleanUrl && cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
  else if (cleanUrl && !cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;

  let drmKeyId = '';
  let drmKey = '';
  let drmReferer = '';
  let finalUrl = cleanUrl;

  try {
    const questionIdx = cleanUrl.indexOf('?');
    if (questionIdx > -1) {
      const paramStr = cleanUrl.slice(questionIdx + 1);
      const params = new URLSearchParams(paramStr);
      drmKeyId = params.get('drmKeyId') || '';
      drmKey = params.get('drmKey') || '';
      drmReferer = params.get('drmReferer') || '';
      params.delete('drmKeyId'); params.delete('drmKey'); params.delete('drmReferer');
      const remaining = params.toString();
      finalUrl = cleanUrl.slice(0, questionIdx) + (remaining ? '?' + remaining : '');
    }
  } catch (_) { finalUrl = cleanUrl.split('?')[0]; }

  const isTvLibree = cleanUrl.includes('tvlibree.com');
  const hasDrmKeys = !!(drmKeyId && drmKey);
  const isDash = cleanUrl.toLowerCase().includes('.mpd') && !isTvLibree && !hasDrmKeys;
  const isDirectVideo = !isDash && (cleanUrl.toLowerCase().includes('.mp4') || cleanUrl.toLowerCase().includes('.m3u8')) && !isTvLibree;
  // DRM channels now go to TvDrmPlayerScreen, so useShakaPlayer is always false here
  const useShakaPlayer = false;
  const isLamovie = cleanUrl.toLowerCase().includes('lamovie') || cleanUrl.toLowerCase().includes('lamov');
  const timeoutDuration = isLamovie ? 35000 : 10000;

  // 🔄 REDIRECT: If a DRM URL reaches this player, send it to DrmPlayerTV
  useEffect(() => {
    if (hasDrmKeys) {
      console.log('[TvPlayer] Redirecting DRM URL to DrmPlayerTV');
      navigation.replace('DrmPlayerTV', { videoUrl });
    }
  }, [hasDrmKeys]);

  // 🐛 DEBUG
  console.log('[TvPlayer] FLAGS → useShakaPlayer:', useShakaPlayer, '| hasDrmKeys:', hasDrmKeys, '| isDash:', isDash);

  // ── Controls Auto-hide ──────────────────────────────────────────────────
  const resetControlsTimeout = () => {
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isPaused && !showQualityPicker) {
        Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => setShowControls(false));
      }
    }, 5000);
  };

  useEffect(() => {
    if (useShakaPlayer) resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isPaused, useShakaPlayer, showQualityPicker]);

  // ── Normal WebView Controls Auto-hide ───────────────────────────────────
  const showWebControlsFn = () => {
    Animated.timing(webControlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    setShowWebControls(true);
    if (webControlsTimeoutRef.current) clearTimeout(webControlsTimeoutRef.current);
    webControlsTimeoutRef.current = setTimeout(() => {
      Animated.timing(webControlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => setShowWebControls(false));
    }, 5000);
  };

  useEffect(() => {
    return () => { if (webControlsTimeoutRef.current) clearTimeout(webControlsTimeoutRef.current); };
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // ── SHAKA UI PLAYER HTML (ClearKey DRM + Speed Fix + Quality API) ──────
  // ══════════════════════════════════════════════════════════════════════════
  const getShakaHtml = () => {
    return `
    <!DOCTYPE html>
    <html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.3.5/controls.min.css">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.3.5/shaka-player.ui.min.js"><\/script>
      <style>
        *{box-sizing:border-box}
        body{margin:0;background:#000;overflow:hidden;height:100vh}
        #vc{width:100vw;height:100vh;position:relative}
        video{width:100%;height:100%;object-fit:contain;background:#000}
        /* Hide Shaka native controls - we use our own overlay */
        .shaka-controls-container{display:none!important;opacity:0!important;pointer-events:none!important}
        .shaka-overflow-menu{display:none!important}
        .shaka-settings-menu{display:none!important}
        .shaka-bottom-controls{display:none!important}
        .shaka-spinner-container{display:none!important}
      </style>
    </head><body>
      <div id="vc" data-shaka-player-container>
        <video id="v" data-shaka-player autoplay playsinline webkit-playsinline></video>
      </div>
      <script>
        var player;
        try { window.ReactNativeWebView.postMessage('dash_log:STEP1 Script block'); } catch(ex){}

        async function init(){
          try { window.ReactNativeWebView.postMessage('dash_log:STEP2 init called'); } catch(ex){}
          
          shaka.polyfill.installAll();
          if(!shaka.Player.isBrowserSupported()){
            window.ReactNativeWebView.postMessage('dash_log:Browser no soportado');
            return;
          }
          window.ReactNativeWebView.postMessage('dash_log:STEP3 browser supported');
          
          var video = document.getElementById('v');

          // ── FIX 1.5x SPEED ─────────────────────────────────────
          video.defaultPlaybackRate = 1.0;
          video.playbackRate = 1.0;
          Object.defineProperty(video, 'defaultPlaybackRate', {
            get: function(){ return 1.0; },
            set: function(v){ /* blocked */ }
          });
          video.addEventListener('ratechange', function(){
            if(Math.abs(video.playbackRate - 1.0) > 0.01){
              video.playbackRate = 1.0;
            }
          });
          // Also intercept via MutationObserver
          setInterval(function(){
            if(Math.abs(video.playbackRate - 1.0) > 0.01) video.playbackRate = 1.0;
          }, 500);
          window.ReactNativeWebView.postMessage('dash_log:STEP4 speed fix applied');

          player = new shaka.Player(video);
          window.ReactNativeWebView.postMessage('dash_log:STEP5 player created');

          player.configure({
            drm: { clearKeys: { '${drmKeyId}': '${drmKey}' } },
            abr: {
              enabled: true,
              defaultBandwidthEstimate: 1500000,
              restrictions: { maxHeight: 1080 },
              switchInterval: 8,
              bandwidthUpgradeTarget: 0.85,
              bandwidthDowngradeTarget: 0.95
            },
            streaming: {
              bufferingGoal: 15,
              rebufferingGoal: 3,
              bufferBehind: 30,
              retryParameters: { maxAttempts: 5, baseDelay: 1000, backoffFactor: 2 }
            }
          });
          window.ReactNativeWebView.postMessage('dash_log:STEP6 configured');

          player.addEventListener('error', function(ev){
            window.ReactNativeWebView.postMessage('dash_log:PlayerError ' + (ev.detail ? ev.detail.code : '?'));
          });

          // ── Video event bridge ─────────────────────────────────
          video.addEventListener('timeupdate', function(){
            window.ReactNativeWebView.postMessage('timeupdate:' + video.currentTime + ',' + (isNaN(video.duration) ? 0 : video.duration));
          });
          video.addEventListener('pause', function(){ window.ReactNativeWebView.postMessage('video_paused'); });
          video.addEventListener('play', function(){ window.ReactNativeWebView.postMessage('video_resumed'); });
          video.addEventListener('playing', function(){
            window.ReactNativeWebView.postMessage('dash_log:VIDEO_PLAYING!');
            window.ReactNativeWebView.postMessage('video_playing');
          });

          // ── RN -> WebView command bridge ────────────────────────
          window.addEventListener('message', function(e){
            var d = e.data;
            if(d === 'CMD_PAUSE') video.pause();
            if(d === 'CMD_PLAY') video.play();
            if(d && d.startsWith && d.startsWith('CMD_SEEK:')) video.currentTime += parseFloat(d.split(':')[1]);
            if(d === 'CMD_GET_QUALITIES') sendQ();
            if(d && d.startsWith && d.startsWith('CMD_SET_QUALITY:')){
              var idx = parseInt(d.split(':')[1]);
              var tr = player.getVariantTracks();
              if(tr[idx]){ player.configure({abr:{enabled:false}}); player.selectVariantTrack(tr[idx], true, 0); }
            }
            if(d === 'CMD_SET_QUALITY_AUTO') player.configure({abr:{enabled:true}});
          });

          function sendQ(){
            var tr = player.getVariantTracks();
            var act = tr.find(function(t){ return t.active; });
            var seen = {};
            var list = tr.filter(function(t){
              var k = t.height + 'x' + t.bandwidth;
              if(seen[k]) return false; seen[k] = true; return t.height;
            }).sort(function(a,b){ return b.height - a.height; })
            .map(function(t){
              return {
                index: tr.indexOf(t),
                label: t.height >= 1080 ? 'Full HD (1080p)' : t.height >= 720 ? 'HD (720p)' : t.height >= 480 ? 'SD (480p)' : (t.height + 'p'),
                active: act && t.id === act.id
              };
            });
            window.ReactNativeWebView.postMessage('qualities:' + JSON.stringify(list));
          }

          // ── Load stream ────────────────────────────────────────
          window.ReactNativeWebView.postMessage('dash_log:STEP7 loading ' + '${finalUrl}');
          try {
            await player.load('${finalUrl}');
            window.ReactNativeWebView.postMessage('dash_log:STEP8 loaded OK!');
            video.playbackRate = 1.0;
            video.play();
            window.ReactNativeWebView.postMessage('video_playing');
            setTimeout(sendQ, 3000);
          } catch(e) {
            window.ReactNativeWebView.postMessage('dash_log:LOAD_ERROR ' + (e.code || e.message));
          }
        }

        // shaka-ui-loaded fires when Shaka UI CSS + JS are both ready
        document.addEventListener('shaka-ui-loaded', init);
        // Fallback in case the event already fired
        document.addEventListener('DOMContentLoaded', function(){
          setTimeout(function(){ if(!player) init(); }, 1500);
        });
      <\/script>
    </body></html>
    `;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ── BRIDGE COMMANDS ───────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const togglePlayPause = () => {
    resetControlsTimeout();
    if (isPaused) {
      webViewRef.current?.injectJavaScript("window.postMessage('CMD_PLAY','*');true;");
      setIsPaused(false);
    } else {
      webViewRef.current?.injectJavaScript("window.postMessage('CMD_PAUSE','*');true;");
      setIsPaused(true);
    }
  };
  const seekBackward = () => { resetControlsTimeout(); webViewRef.current?.injectJavaScript("window.postMessage('CMD_SEEK:-15','*');true;"); };
  const seekForward = () => { resetControlsTimeout(); webViewRef.current?.injectJavaScript("window.postMessage('CMD_SEEK:15','*');true;"); };

  const openQualityPicker = () => {
    resetControlsTimeout();
    webViewRef.current?.injectJavaScript("window.postMessage('CMD_GET_QUALITIES','*');true;");
    setShowQualityPicker(true);
  };

  const selectQuality = (index: number | 'auto') => {
    setShowQualityPicker(false);
    if (index === 'auto') {
      webViewRef.current?.injectJavaScript("window.postMessage('CMD_SET_QUALITY_AUTO','*');true;");
    } else {
      webViewRef.current?.injectJavaScript(`window.postMessage('CMD_SET_QUALITY:${index}', '*'); true; `);
    }
  };

  // ── Normal WebView bridge ───────────────────────────────────────────────
  const webTogglePlay = () => {
    showWebControlsFn();
    webViewRef.current?.injectJavaScript(`
      (function(){
        var v=document.querySelector('video');
        if(v && !v.paused){
          v.pause();
        } else if(v) {
          v.play();
        }
      })();true;
    `);
  };
  const webSeekBack = () => { showWebControlsFn(); webViewRef.current?.injectJavaScript("(function(){var v=document.querySelector('video');if(v)v.currentTime-=15;})();true;"); };
  const webSeekFwd = () => { showWebControlsFn(); webViewRef.current?.injectJavaScript("(function(){var v=document.querySelector('video');if(v)v.currentTime+=15;})();true;"); };

  // ══════════════════════════════════════════════════════════════════════════
  // ── MESSAGE HANDLER ───────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const handleMessage = (event: any) => {
    const msg: string = event.nativeEvent.data;
    if (msg === 'cmd_open_controls') {
      resetControlsTimeout();
      setShowOverlayTrigger(t => t + 1);
    }
    if (msg.startsWith('dash_log:')) { console.log('[DashPlayer]', msg.replace('dash_log:', '')); return; }
    handleOverlayMessage(msg, {
      setCurrentTime,
      setDuration,
      setIsPaused,
      setQualityLevels,
      setIsPlaying: (v) => { if (v) setIsVideoPlaying(true); },
    });
  };

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const lockTimer = setTimeout(() => { if (isMounted) setIsLocked(true); }, 2000);
    const failSafeTimer = setTimeout(() => { if (isMounted) setIsVideoPlaying(true); }, timeoutDuration);
    return () => { isMounted = false; clearTimeout(lockTimer); clearTimeout(failSafeTimer); };
  }, []);

  useEffect(() => {
    const backAction = () => { navigation.goBack(); return true; };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [navigation]);

  if (!cleanUrl) return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><AlertCircle color="#FACC15" size={64} /></View>;

  const isWaitScreenVisible = !isDash && !isDirectVideo && !isVideoPlaying;

  // ══════════════════════════════════════════════════════════════════════════
  // ── AD BLOCKER + AFTER-LOAD JS ────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const adBlockerJS = `
  (function () {
    // ──────────────────── BLOQUEO DE SCRIPTS PUBLICITARIOSs ────────────────────
    var AD_DOMAINS = [
        'doubleclick', 'googlesyndication', 'adnxs', 'popads', 'popcash',
        'vimeus', 'adcash', 'traffic', 'exoclick', 'juicyads', 'trafficjunky',
        'propellerads', 'adsterra', 'hilltopads', 'monetag', 'revcontent',
        'taboola', 'outbrain', 'mgid', 'bidverdane', 'adspyglass', 'richads',
        'eroadvertising', 'plugrush', 'adskeeper', 'adhitz', 'viraltrend',
        'popunder', 'pounder', 'clkqw', 'clkrev', 'linkvertise', 'shortlink',
        'clicksfly', 'shrinkearn', 'gplinks', 'ouo.io', 'exe.io', 'fc.lc',
        'fir.pw', 'bcvc.net', 'shrink', 'adf.ly', 'ay.gy', 'cur.lv',
    ];

    // Bloquear fetch
    var _fetch = window.fetch;
    window.fetch = function(url, opts) {
        var u = String(url || '').toLowerCase();
        if (AD_DOMAINS.some(function(d){ return u.includes(d); })) {
            return Promise.reject(new Error('AD_BLOCKED'));
        }
        return _fetch.apply(this, arguments);
    };

    // Bloquear XMLHttpRequest
    var _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        var u = String(url || '').toLowerCase();
        if (AD_DOMAINS.some(function(d){ return u.includes(d); })) {
            this._blocked = true;
        }
        return _open.apply(this, arguments);
    };
    var _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        if (this._blocked) return;
        return _send.apply(this, arguments);
    };

    // Bloquear appendChild de scripts de ads
    var _ac = Node.prototype.appendChild;
    Node.prototype.appendChild = function(el) {
        if (el && el.tagName === 'SCRIPT') {
            var src = (el.src || '').toLowerCase();
            if (AD_DOMAINS.some(function(d){ return src.includes(d); })) return el;
        }
        if (el && el.tagName === 'IFRAME') {
            var src2 = (el.src || '').toLowerCase();
            if (AD_DOMAINS.some(function(d){ return src2.includes(d); })) return el;
        }
        return _ac.apply(this, arguments);
    };
    var _ip = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function(pos, html) {
        var h = String(html || '').toLowerCase();
        if (AD_DOMAINS.some(function(d){ return h.includes(d); })) return;
        return _ip.apply(this, arguments);
    };

    // Bloquear window.open (popups/popunders)
    window.open = function() { return null; };
    window.alert = function() { return true; };
    window.confirm = function() { return true; };
    window.prompt = function() { return ''; };

    // Bloquear document.write con ads
    var _dw = document.write.bind(document);
    document.write = function(html) {
        var h = String(html || '').toLowerCase();
        if (AD_DOMAINS.some(function(d){ return h.includes(d); })) return;
        return _dw(html);
    };
  })(); true;
`;

  const afterLoadJS = `
  (function () {
    document.body.style.backgroundColor = '#000'; document.body.style.overflow = 'hidden';
    var notified = false, attempts = 0, interval;

    // ─── LIMPIEZA AGRESIVA DE ADS (vimeos.net, etc.) ─────
    var AD_SELECTORS = [
        '[id*="ad"]', '[class*="ad-"]', '[class*="-ad"]', '[class*="ads"]',
        '[id*="popup"]', '[class*="popup"]', '[class*="overlay"]',
        '[class*="banner"]', '[id*="banner"]', '[class*="promo"]',
        '[data-ad]', 'ins.adsbygoogle', 'div[style*="z-index: 9"]',
        '.vd-overlay', '.vd-popup', '#wad-leader-board', '#aswift_',
        '.adbanner', '.adbox', '.ad-slot', '.ad-container',
        'div[class*="monetag"]', 'div[class*="adsense"]',
    ];

    function removeAds() {
        AD_SELECTORS.forEach(function(sel) {
            document.querySelectorAll(sel).forEach(function(el) {
                var v = el.querySelector('video');
                var iframe = el.querySelector('iframe');
                if (!v && !iframe) {
                    try { el.remove(); } catch(e) {}
                }
            });
        });
        // Remover iframes de ads (que NO sean el reproductor principal)
        document.querySelectorAll('iframe').forEach(function(f, i) {
            if (i === 0) return; // El primer iframe suele ser el player
            var src = (f.src || '').toLowerCase();
            var adDomains = ['ads', 'popup', 'popunder', 'monetag', 'exoclick', 'adsterra', 'propellerads', 'traffick', 'adcash'];
            if (adDomains.some(function(d){ return src.includes(d); })) {
                try { f.remove(); } catch(e) {}
            }
        });
        // Remover overlays de alta z-index que no sean el player
        document.querySelectorAll('div, a').forEach(function(el) {
            if (el.tagName === 'VIDEO' || el.tagName === 'IFRAME') return;
            var st = window.getComputedStyle(el);
            var z = parseInt(st.zIndex || '0');
            if ((st.position === 'fixed' || st.position === 'absolute') && z > 1000) {
                var hasVideo = el.querySelector('video, iframe');
                if (!hasVideo) try { el.remove(); } catch(e) {}
            }
        });
    }

    var tryPlay = function () {
        attempts++; if (attempts > 60) { clearInterval(interval); return; }
        removeAds();
        
        var video = document.querySelector('video'); 
        var iframe = document.querySelector('iframe');
        
        if (iframe && !video) { iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#000;border:none;'; }
        if (video) {
            video.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;object-fit:contain;background:#000;';
            if (!notified && !video.paused && video.currentTime > 0.1) {
                notified = true; try { window.ReactNativeWebView.postMessage('video_playing'); } catch (e) { }
            }
            if (video.paused && attempts > 2) { video.muted = false; video.volume = 1; video.play().catch(function(){}); }
            video.muted = false; video.volume = 1;
        }

        var playBtns = ['.vjs-big-play-button', '.jw-icon-display', '.plyr__control--overlaid', '.play-btn', '.voe-play', '.play'];
        playBtns.forEach(function (sel) { var b = document.querySelector(sel); if (b) try { b.click(); } catch(e){} });

        if(attempts === 4 || attempts === 8) {
            try {
                var centerEl = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                if(centerEl && centerEl.tagName !== 'VIDEO') {
                    centerEl.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
                }
            } catch(e) {}
        }
    };
    interval = setInterval(tryPlay, 800);

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 66 || e.keyCode === 23) {
        e.preventDefault(); e.stopImmediatePropagation();
        // Notificar para mostrar el overlay
        try { window.ReactNativeWebView.postMessage('cmd_open_controls'); } catch (x) { }
        
        var v = document.querySelector('video');
        if (v) { if (v.paused) v.play(); else v.pause(); }
      }
    }, true);
    // Bloquear cualquier handler de keydown de la página que interfiera
    window.addEventListener('keydown', function(e) {
        if (e.keyCode === 37 || e.keyCode === 39) {
            e.stopImmediatePropagation();
            var v = document.querySelector('video');
            if (v) v.currentTime += e.keyCode === 37 ? -10 : 10;
        }
    }, true);
  })();
true;
`;

  const handleShouldStartLoadWithRequest = (request: any) => {
    const url = request.url.toLowerCase();
    const bad = ['vimeus', 'adcash', 'popads', 'popcash', 'doubleclick', 'googlesyndication', 'traffic', 'onclick', 'track'];
    if (bad.some(h => url.includes(h))) return false;
    if (url.startsWith('intent://') || url.startsWith('market://') || url.includes('play.google.com')) return false;

    // Si la navegacion es en el frame principal (top frame), ser muy estrictos
    if (isLocked && request.isTopFrame) {
      const originalDomain = cleanUrl.split('/')[2];
      if (originalDomain && !url.includes(originalDomain) && !url.includes('about:blank') && !url.includes('mp4') && !url.includes('m3u8')) return false;
    }
    return true;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ── DRM NATIVE OVERLAY ────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER ────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Overlay compartido para Shaka/WebView */}
      {(useShakaPlayer || (!isDash && !isDirectVideo)) && (
        <TvPlayerOverlay
          webViewRef={webViewRef}
          mode={useShakaPlayer ? 'shaka' : 'webview'}
          currentTime={currentTime}
          duration={duration}
          isPaused={isPaused}
          qualityLevels={qualityLevels}
          accentColor="#FACC15"
          forceShowTrigger={showOverlayTrigger}
          onBack={() => navigation.goBack()}
        />
      )}

      {isDash ? (
        <View style={StyleSheet.absoluteFillObject}>
          {!isVideoPlaying && (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', zIndex: 40 }]}>
              <ActivityIndicator size="large" color="#FACC15" />
              <Text style={{ color: '#FACC15', fontWeight: '900', fontSize: 18, marginTop: 16, letterSpacing: 2, textTransform: 'uppercase' }}>Conectando DRM...</Text>
            </View>
          )}
          <Video source={{ uri: finalUrl }} style={StyleSheet.absoluteFillObject} resizeMode="contain" controls={true} onLoad={() => setIsVideoPlaying(true)} />
        </View>
      ) : isDirectVideo ? (
        <Video source={{ uri: cleanUrl }} style={StyleSheet.absoluteFillObject} resizeMode="contain" controls={true} />
      ) : (
        <View style={StyleSheet.absoluteFillObject}>
          {isWaitScreenVisible && (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', zIndex: 40 }]}>
              <ActivityIndicator size="large" color="#FACC15" />
              <Text style={{ color: '#FACC15', fontWeight: '900', fontSize: 18, marginTop: 16, letterSpacing: 2, textTransform: 'uppercase' }}>Conectando...</Text>
              <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 8, textAlign: 'center', maxWidth: '70%' }}>Bloqueando anuncios y ajustando el reproductor</Text>
            </View>
          )}

          <WebView
            ref={webViewRef}
            userAgent={CHROME_UA}
            source={useShakaPlayer
              ? { html: getShakaHtml(), baseUrl: drmReferer || 'https://player.sensa.com.ar/' }
              : { uri: cleanUrl, headers: { 'Referer': cleanUrl.split('/').slice(0, 3).join('/') + '/' } }
            }
            style={{ flex: 1, backgroundColor: '#000', opacity: isWaitScreenVisible ? 0 : 1 }}
            allowsFullscreenVideo={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            allowsAirPlayForMediaPlayback={false}
            domStorageEnabled={true}
            javaScriptEnabled={true}
            thirdPartyCookiesEnabled={true}
            sharedCookiesEnabled={true}
            androidLayerType="hardware"
            mixedContentMode="always"
            injectedJavaScriptBeforeContentLoaded={useShakaPlayer ? undefined : adBlockerJS}
            injectedJavaScript={useShakaPlayer ? undefined : afterLoadJS}
            injectedJavaScriptForMainFrameOnly={false}
            onMessage={handleMessage}
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          />
        </View>
      )}
    </View>
  );
}