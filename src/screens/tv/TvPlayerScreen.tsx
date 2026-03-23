import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, ActivityIndicator, BackHandler, Text, StyleSheet, Animated, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import { AlertCircle, SkipForward } from 'lucide-react-native';
import Video from 'react-native-video';
import { Buffer } from 'buffer';
import TvFocusable from '../../components/tv/TvFocusable';
import TvContentOverlay from '../../components/tv/TvContentOverlay';
import F1TelemetrySidePanel from '../../components/tv/F1TelemetrySidePanel';

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ══════════════════════════════════════════════════════════════════════════
// ── MODULE-LEVEL JS CONSTANTS (allocated once, not per render) ──────────
// ══════════════════════════════════════════════════════════════════════════
const AD_BLOCKER_JS = `
(function () {
  var AD_DOMAINS = [
      'doubleclick', 'googlesyndication', 'adnxs', 'popads', 'popcash',
      'adcash', 'exoclick', 'juicyads', 'trafficjunky',
      'propellerads', 'adsterra', 'hilltopads', 'monetag', 'revcontent',
      'taboola', 'outbrain', 'mgid', 'bidverdane', 'adspyglass', 'richads',
      'eroadvertising', 'plugrush', 'adskeeper', 'adhitz', 'viraltrend',
      'popunder', 'pounder', 'clkqw', 'clkrev', 'linkvertise', 'shortlink',
      'clicksfly', 'shrinkearn', 'gplinks', 'ouo.io', 'exe.io', 'fc.lc',
      'fir.pw', 'bcvc.net', 'shrink', 'adf.ly', 'ay.gy', 'cur.lv',
  ];
  // Dominios de CDN/player que NUNCA debemos bloquear
  var SAFE_DOMAINS = ['jwplayer', 'jwpcdn', 'jwpsrv', 'shaka', 'dashjs', 'hls.js', 'videojs',
      'cvattv', 'castercdn', 'nebunexa', 'cdn.', 'edge-live', 'akamai', 'cloudfront'];
  function isAd(u) {
      if (SAFE_DOMAINS.some(function(d){ return u.includes(d); })) return false;
      return AD_DOMAINS.some(function(d){ return u.includes(d); });
  }
  var _fetch = window.fetch;
  window.fetch = function(url, opts) {
      var u = String(url || '').toLowerCase();
      if (isAd(u)) return Promise.reject(new Error('AD_BLOCKED'));
      return _fetch.apply(this, arguments);
  };
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
      var u = String(url || '').toLowerCase();
      if (isAd(u)) this._blocked = true;
      return _open.apply(this, arguments);
  };
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
      if (this._blocked) return;
      return _send.apply(this, arguments);
  };
  var _ac = Node.prototype.appendChild;
  Node.prototype.appendChild = function(el) {
      if (el && el.tagName === 'SCRIPT') { var src = (el.src || '').toLowerCase(); if (isAd(src)) return el; }
      if (el && el.tagName === 'IFRAME') { var src2 = (el.src || '').toLowerCase(); if (isAd(src2)) return el; }
      return _ac.apply(this, arguments);
  };
  var _ip = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(pos, html) {
      var h = String(html || '').toLowerCase();
      if (isAd(h)) return;
      return _ip.apply(this, arguments);
  };
  window.open = function() { return null; };
  window.alert = function() { return true; };
  window.confirm = function() { return true; };
  window.prompt = function() { return ''; };
  var _dw = document.write.bind(document);
  document.write = function(html) {
      var h = String(html || '').toLowerCase();
      if (isAd(h)) return;
      return _dw(html);
  };
})(); true;
`;

const AFTER_LOAD_JS = `
(function () {
  document.body.style.backgroundColor = '#000'; document.body.style.overflow = 'hidden';
  var notified = false, attempts = 0, interval;
  var videoListenersAttached = false;

  // Detectar si hay un reproductor embebido manejado (JW Player, video.js, Shaka, etc.)
  function hasManagedPlayer() {
      return !!(window.jwplayer || document.querySelector('.jwplayer, .jw-wrapper, [class*="jw-"], .video-js, .vjs-tech, .shaka-video-container'));
  }

  // Selectores de ads seguros (no interfieren con reproductores)
  var SAFE_AD_SELECTORS = [
      '[id*="popup"]', '[class*="popup"]',
      '[class*="banner"]:not(.jw-banner)', '[id*="banner"]', '[class*="promo"]',
      '[data-ad]', 'ins.adsbygoogle',
      '.adbanner', '.adbox', '.ad-slot', '.ad-container',
      'div[class*="monetag"]', 'div[class*="adsense"]',
  ];

  // Selectores agresivos (solo para sitios sin reproductor embebido)
  var AGGRESSIVE_AD_SELECTORS = [
      '[id*="ad"]', '[class*="ad-"]', '[class*="-ad"]', '[class*="ads"]',
      '[class*="overlay"]',
      'div[style*="z-index: 9"]',
      '.vd-overlay', '.vd-popup', '#wad-leader-board', '#aswift_',
  ];

  function removeAds() {
      var managed = hasManagedPlayer();
      var selectors = SAFE_AD_SELECTORS.slice();
      if (!managed) { selectors = selectors.concat(AGGRESSIVE_AD_SELECTORS); }
      selectors.forEach(function(sel) {
          try {
              document.querySelectorAll(sel).forEach(function(el) {
                  var v = el.querySelector('video');
                  var iframe = el.querySelector('iframe');
                  if (!v && !iframe) { try { el.remove(); } catch(e) {} }
              });
          } catch(e) {}
      });
      if (!managed) {
          document.querySelectorAll('iframe').forEach(function(f, i) {
              if (i === 0) return;
              var src = (f.src || '').toLowerCase();
              var adDomains = ['ads', 'popup', 'popunder', 'monetag', 'exoclick', 'adsterra', 'propellerads', 'adcash'];
              if (adDomains.some(function(d){ return src.includes(d); })) { try { f.remove(); } catch(e) {} }
          });
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
  }

  // Adjuntar listeners de estado al elemento video (una sola vez)
  function attachVideoListeners(video) {
      if (videoListenersAttached || !video) return;
      videoListenersAttached = true;
      video.addEventListener('play', function() {
          if (!notified) { notified = true; }
          try { window.ReactNativeWebView.postMessage('video_playing'); } catch(e) {}
      });
      video.addEventListener('pause', function() {
          // Solo reportar pausa si ya habiamos notificado el play (evita false positives al cargar)
          if (notified) {
            try { window.ReactNativeWebView.postMessage('video_paused'); } catch(e) {}
          }
      });
      video.addEventListener('timeupdate', function() {
          if (!notified && video.currentTime > 0.1) {
              notified = true;
              try { window.ReactNativeWebView.postMessage('video_playing'); } catch(e) {}
          }
      });
  }

  var tryPlay = function () {
      attempts++;
      // Dejar de intentar después de 60 intentos (48 segundos)
      if (attempts > 60) { clearInterval(interval); return; }

      removeAds();

      var managed = hasManagedPlayer();
      var video = document.querySelector('video');
      var iframe = document.querySelector('iframe');

      if (managed) {
          // --- MANAGED PLAYER (JW Player, video.js, Shaka) ---
          // Adjuntar listeners de estado al video (una sola vez)
          if (video) attachVideoListeners(video);

          // Notificar fallback después de 8 intentos si el video no arrancó
          if (attempts > 8 && !notified) {
              notified = true;
              try { window.ReactNativeWebView.postMessage('video_playing'); } catch (e) { }
          }

          // Solo dar click al botón grande de play en los primeros 5 intentos
          // (NO indefinidamente — evita el loop de pause/resume)
          if (attempts <= 5) {
              // Selectores específicos del big-play-button, NO '.play' (demasiado amplio)
              var managedPlayBtns = ['.vjs-big-play-button', '.jw-icon-display', '.plyr__control--overlaid', '.voe-play', '.play-btn'];
              managedPlayBtns.forEach(function(sel) { var b = document.querySelector(sel); if (b) try { b.click(); } catch(e){} });
          }

          // Si el video ya está reproduciendo, podemos limpiar el interval
          if (video && !video.paused && video.currentTime > 0.1) {
              clearInterval(interval);
          }

      } else {
          // --- REGULAR SITE (sin managed player) ---
          if (iframe && !video) { iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#000;border:none;'; }
          if (video) {
              attachVideoListeners(video);
              video.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;object-fit:contain;background:#000;';
              if (video.paused && attempts > 2) { video.muted = false; video.volume = 1; video.play().catch(function(){}); }
              video.muted = false; video.volume = 1;
              // Si el video ya está corriendo, detener el interval
              if (!video.paused && video.currentTime > 0.1) { clearInterval(interval); }
          }

          // Click a botones de play específicos (solo primeros 5 intentos, sin '.play')
          if (attempts <= 5) {
              var playBtns = ['.vjs-big-play-button', '.jw-icon-display', '.plyr__control--overlaid', '.voe-play', '.play-btn'];
              playBtns.forEach(function (sel) { var b = document.querySelector(sel); if (b) try { b.click(); } catch(e){} });
          }

          // Click al centro como fallback en intentos 4 y 8
          if (attempts === 4 || attempts === 8) {
              try { var centerEl = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                  if(centerEl && centerEl.tagName !== 'VIDEO') centerEl.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
              } catch(e) {}
          }
      }
  };
  interval = setInterval(tryPlay, 800);

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 66 || e.keyCode === 23) {
      e.preventDefault(); e.stopImmediatePropagation();
      try { window.ReactNativeWebView.postMessage('cmd_open_controls'); } catch (x) { }
      var v = document.querySelector('video'); if (v) { if (v.paused) v.play(); else v.pause(); }
    }
  }, true);
  window.addEventListener('keydown', function(e) {
      if (e.keyCode === 37 || e.keyCode === 39) {
          e.stopImmediatePropagation();
          var v = document.querySelector('video'); if (v) v.currentTime += e.keyCode === 37 ? -10 : 10;
      }
  }, true);
})();
true;
`;

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
  const { videoUrl, seriesItem, season: routeSeason, episode: routeEpisode } = route.params;

  // ── Series / Next Episode context ────────────────────────────────────────
  const currentSeason: number | undefined = routeSeason;
  const currentEpisode: number | undefined = routeEpisode;

  // Compute the URL + metadata for the next episode (if applicable)
  const getNextEpisodeData = useCallback((): { url: string; title: string; season: number; episode: number } | null => {
    if (!seriesItem || currentSeason == null || currentEpisode == null) return null;
    const item = seriesItem;

    // Try same season, next episode
    const currentSeasonData = item.seasonsData?.find((s: any) => s.season === currentSeason);
    const nextEp = currentEpisode + 1;
    if (currentSeasonData && nextEp <= currentSeasonData.episodes) {
      const linksData = item.episodeLinks?.[`${currentSeason}-${nextEp}`];
      const url = Array.isArray(linksData) ? linksData[0] : (typeof linksData === 'string' ? linksData : null)
        || item.servers?.[0]?.url || item.videoUrl;
      if (!url) return null;
      return { url, title: `${item.title} - T${currentSeason} E${nextEp}`, season: currentSeason, episode: nextEp };
    }

    // Try next season episode 1
    const nextSeason = currentSeason + 1;
    const nextSeasonData = item.seasonsData?.find((s: any) => s.season === nextSeason);
    if (nextSeasonData && nextSeasonData.episodes > 0) {
      const linksData = item.episodeLinks?.[`${nextSeason}-1`];
      const url = Array.isArray(linksData) ? linksData[0] : (typeof linksData === 'string' ? linksData : null)
        || item.servers?.[0]?.url || item.videoUrl;
      if (!url) return null;
      return { url, title: `${item.title} - T${nextSeason} E1`, season: nextSeason, episode: 1 };
    }

    return null;
  }, [seriesItem, currentSeason, currentEpisode]);

  const nextEpisodeData = getNextEpisodeData();

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [nextEpDismissed, setNextEpDismissed] = useState(false);
  const [nativeMode, setNativeMode] = useState(false);

  // ── Overlay State ─────────────────────────────────────────
  const [showControls, setShowControls] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const [showOverlayTrigger, setShowOverlayTrigger] = useState(0);
  // F1 PiP panel
  const [showF1Panel, setShowF1Panel] = useState(false);

  // ── Quality State (unused, kept for Shaka compatibility) ───────────────────
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<any[]>([]);

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
  const handleMessage = useCallback((event: any) => {
    const msg: string = event.nativeEvent.data;
    if (msg === 'cmd_open_controls') {
      setShowOverlayTrigger(t => t + 1);
    }
    if (msg.startsWith('dash_log:')) { console.log('[DashPlayer]', msg.replace('dash_log:', '')); return; }
    if (msg.startsWith('currentTime:')) { setCurrentTime(parseFloat(msg.replace('currentTime:', '')) || 0); return; }
    if (msg.startsWith('duration:')) { setDuration(parseFloat(msg.replace('duration:', '')) || 0); return; }
    if (msg === 'paused') { setIsPaused(true); return; }
    if (msg === 'playing' || msg === 'video_playing') { setIsPaused(false); setIsVideoPlaying(true); }
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const lockTimer = setTimeout(() => { if (isMounted) setIsLocked(true); }, 2000);
    const failSafeTimer = setTimeout(() => { if (isMounted) setIsVideoPlaying(true); }, timeoutDuration);
    return () => { isMounted = false; clearTimeout(lockTimer); clearTimeout(failSafeTimer); };
  }, []);

  useEffect(() => {
    const backAction = () => {
      if (nativeMode) { setNativeMode(false); return true; }
      navigation.goBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [navigation, nativeMode]);

  if (!cleanUrl) return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><AlertCircle color="#B026FF" size={64} /></View>;

  const isWaitScreenVisible = !isDash && !isDirectVideo && !isVideoPlaying;

  // Show "Next Episode" card when within 2 min of end (and there IS a next episode)
  const isNearEnd = !!nextEpisodeData && !nextEpDismissed && duration > 30 && currentTime > 0 && (duration - currentTime) <= 120;

  const handleNextEpisode = () => {
    if (!nextEpisodeData) return;
    const { url, title, season, episode } = nextEpisodeData;
    if (seriesItem) {
      const { markAsWatched, addToHistory } = require('../../store/useAppStore').useAppStore.getState();
      markAsWatched(`${seriesItem.id}-s${season}-e${episode}`);
      addToHistory(seriesItem, season, episode);
    }
    navigation.replace('PlayerTV', {
      videoUrl: url,
      title,
      seriesItem,
      season,
      episode,
    });
  };

  // Ad blocker and after-load scripts are defined as module-level constants
  // for performance (see AD_BLOCKER_JS and AFTER_LOAD_JS above)

  const handleShouldStartLoadWithRequest = useCallback((request: any) => {
    const url = request.url.toLowerCase();

    // Bloquear intents de "instalar reproductor" (siempre)
    if (url.startsWith('intent://') || url.startsWith('market://') || url.includes('play.google.com')) return false;

    // Bloquear ads y popunders conocidos (siempre)
    const BLOCKED = [
      'adcash', 'popads', 'popcash', 'doubleclick', 'googlesyndication',
      'exoclick', 'propellerads', 'adsterra', 'monetag', 'popunder',
      'onclick', 'clickadu', 'adspop', 'adskeeper',
    ];
    if (BLOCKED.some(h => url.includes(h))) return false;

    // Dominios de CDN/streaming — siempre permitir
    const ALWAYS_ALLOW = [
      'cvattv.com.ar', 'nebunexa', 'widevine', 'license', 'drm',
      'castercdn', 'cablevision', 'flow.com.ar',
      'angulismotv', 'streamtp', 'welivesports', 'bestleague',
      'jwplayer', 'jwpcdn', 'jwpsrv', 'akamai', 'cloudfront', 'edge-live',
      'shaka', 'dashjs', 'videojs', 'cdn.', '.mpd', '.m3u8', '.mp4', '.ts',
      // Reproductores de películas/series
      'voe.sx', 'streamtape', 'doodstream', 'filemoon', 'wootly',
      'vidhide', 'vidfast', 'dropload', 'uqload', 'upstream',
    ];
    if (ALWAYS_ALLOW.some(d => url.includes(d))) return true;

    // Solo bloquear top-frame si el destino es claramente una página de descarga
    // o una tienda de apps (no bloqueamos reproductores que redirigen dentro de su CDN)
    if (isLocked && request.isTopFrame) {
      const isAppStore = url.includes('apk') || url.includes('download') || url.includes('install');
      if (isAppStore) return false;
    }

    return true;
  }, [isLocked, cleanUrl]);


  // ══════════════════════════════════════════════════════════════════════════
  // ── DRM NATIVE OVERLAY ────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER ────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: '#000', flexDirection: 'row' }}>
      {/* ── VIDEO AREA (100% o 65% en modo PiP) ──────────────── */}
      <View style={{ flex: showF1Panel ? 0.65 : 1, backgroundColor: '#000' }}>

        {/* ── NEXT EPISODE CARD ──────────────────────────────── */}
        {isNearEnd && (
          <View style={{
            position: 'absolute', bottom: 80, right: 40, zIndex: 999,
            backgroundColor: 'rgba(0,0,0,0.88)',
            borderRadius: 16, padding: 20, minWidth: 320,
            borderWidth: 1, borderColor: 'rgba(176,38,255,0.4)',
            shadowColor: '#B026FF', shadowOpacity: 0.3, shadowRadius: 20,
          }}>
            <Text style={{ color: '#B026FF', fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>A continuación</Text>
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 16 }}>{nextEpisodeData!.title}</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TvFocusable
                hasTVPreferredFocus={true}
                onPress={handleNextEpisode}
                borderWidth={0}
                scaleTo={1.06}
                style={{ borderRadius: 10, flex: 1 }}
              >
                {(f: boolean) => (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: f ? '#fff' : '#B026FF',
                    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10,
                  }}>
                    <SkipForward color={f ? '#B026FF' : '#fff'} size={20} />
                    <Text style={{ color: f ? '#B026FF' : '#fff', fontWeight: '900', fontSize: 15, marginLeft: 8 }}>Siguiente episodio</Text>
                  </View>
                )}
              </TvFocusable>
              <TvFocusable
                onPress={() => setNextEpDismissed(true)}
                borderWidth={0}
                scaleTo={1.06}
                style={{ borderRadius: 10 }}
              >
                {(f: boolean) => (
                  <View style={{
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: f ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)',
                    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
                  }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>✕</Text>
                  </View>
                )}
              </TvFocusable>
            </View>
          </View>
        )}

        {/* Overlay de contenido (películas/series) */}
        {(useShakaPlayer || (!isDash && !isDirectVideo)) && (
          <TvContentOverlay
            webViewRef={webViewRef}
            title={route.params?.title ?? ''}
            currentTime={currentTime}
            duration={duration}
            isPaused={isPaused}
            forceShowTrigger={showOverlayTrigger}
            onBack={() => navigation.goBack()}
          />
        )}

        {isDash ? (
          <View style={StyleSheet.absoluteFillObject}>
            {!isVideoPlaying && (
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', zIndex: 40 }]}>
                <ActivityIndicator size="large" color="#B026FF" />
                <Text style={{ color: '#B026FF', fontWeight: '900', fontSize: 18, marginTop: 16, letterSpacing: 2, textTransform: 'uppercase' }}>Conectando DRM...</Text>
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
                <ActivityIndicator size="large" color="#B026FF" />
                <Text style={{ color: '#B026FF', fontWeight: '900', fontSize: 18, marginTop: 16, letterSpacing: 2, textTransform: 'uppercase' }}>Conectando...</Text>
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
              injectedJavaScriptBeforeContentLoaded={useShakaPlayer ? undefined : AD_BLOCKER_JS}
              injectedJavaScript={useShakaPlayer ? undefined : AFTER_LOAD_JS}
              injectedJavaScriptForMainFrameOnly={false}
              onMessage={handleMessage}
              originWhitelist={['*']}
              setSupportMultipleWindows={false}
              javaScriptCanOpenWindowsAutomatically={false}
              onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            />
          </View>
        )}
      </View>{/* fin video area */}

      {/* ── F1 TELEMETRÍA PANEL (35%) ──────────────────────── */}
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