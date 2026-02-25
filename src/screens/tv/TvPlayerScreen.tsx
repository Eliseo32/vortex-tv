import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, BackHandler, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ShieldCheck, AlertCircle } from 'lucide-react-native';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import Video from 'react-native-video';

export default function TvPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const webViewRef = useRef<WebView>(null);

  const { videoUrl } = route.params;

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const cleanUrl = videoUrl ? videoUrl.trim() : '';
  const isDash = cleanUrl.toLowerCase().includes('.mpd');
  const isDirectVideo = !isDash && (cleanUrl.toLowerCase().includes('.mp4') || cleanUrl.toLowerCase().includes('.m3u8'));

  // Extraer parámetros DRM y referer del query string
  let drmKeyId = '';
  let drmKey = '';
  let finalUrl = cleanUrl;

  try {
    const questionIdx = cleanUrl.indexOf('?');
    if (questionIdx > -1) {
      const paramStr = cleanUrl.slice(questionIdx + 1);
      const params = new URLSearchParams(paramStr);
      drmKeyId = params.get('drmKeyId') || '';
      drmKey = params.get('drmKey') || '';
      params.delete('drmKeyId');
      params.delete('drmKey');
      params.delete('drmReferer');
      const remaining = params.toString();
      finalUrl = cleanUrl.slice(0, questionIdx) + (remaining ? '?' + remaining : '');
    }
  } catch (e) {
    finalUrl = cleanUrl.split('?')[0];
  }

  // ─── Configuración del reproductor nativo DRM (ExoPlayer) ───────────────
  const drmConfig = (drmKeyId && drmKey) ? {
    type: 'clearkey',
    licenseServer: `data:application/json;base64,${btoa(JSON.stringify({
      keys: [{
        kty: "oct",
        k: Buffer.from(drmKey, 'hex').toString('base64url'),
        kid: Buffer.from(drmKeyId, 'hex').toString('base64url')
      }],
      type: "temporary"
    }))}`
  } : undefined;

  const isLamovie = cleanUrl.toLowerCase().includes('lamovie') || cleanUrl.toLowerCase().includes('lamov');
  const timeoutDuration = isLamovie ? 35000 : 10000;

  useEffect(() => {
    let isMounted = true;

    const lockTimer = setTimeout(() => { if (isMounted) setIsLocked(true); }, 2000);
    const failSafeTimer = setTimeout(() => { if (isMounted) setIsVideoPlaying(true); }, timeoutDuration);

    return () => {
      isMounted = false;
      clearTimeout(lockTimer);
      clearTimeout(failSafeTimer);
    };
  }, []);

  useEffect(() => {
    const backAction = () => { navigation.goBack(); return true; };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [navigation]);

  const beforeLoadJS = `
    window.open = function() { return null; };
    window.alert = function() { return null; };
    window.confirm = function() { return null; };
    window.prompt = function() { return null; };
    
    if (window.HTMLVideoElement) {
      window.HTMLVideoElement.prototype.webkitShowPlaybackTargetPicker = function() { return null; };
    }
    window.WebKitPlaybackTargetAvailabilityEvent = undefined;
    
    // INMUNIDAD TOTAL A ANUNCIOS: Bloquea cualquier redirección al hacer clic
    document.addEventListener('click', function(e) {
      const target = e.target.closest('a');
      if (target) {
        e.preventDefault(); 
        e.stopPropagation();
      }
    }, true);

    window.chrome = window.chrome || {};
    window.chrome.cast = { isAvailable: false };
    true;
  `;

  const afterLoadJS = `
    (function() {
      document.body.style.backgroundColor = '#000';
      document.body.style.overflow = 'hidden';
      
      let isPlayingNotified = false;
      let fullscreenClicked = false;
      let attempts = 0;
      let fastInterval;

      window.addEventListener('message', function(e) {
        if (e.data === 'APAGAR_ESCANER') clearInterval(fastInterval);
        if (e.data === 'video_playing_relay') {
          if (!isPlayingNotified) {
            isPlayingNotified = true;
            try { window.ReactNativeWebView.postMessage('video_playing'); } catch(err) {}
          }
        }
      });

      const triggerPlaybackFound = (videoEl) => {
        if (isPlayingNotified) return;
        isPlayingNotified = true;
        
        try { window.ReactNativeWebView.postMessage('video_playing'); } catch(e) {}
        try { window.top.postMessage('video_playing_relay', '*'); } catch(e) {}
        
        if (!fullscreenClicked) {
          const fsBtn = document.querySelector('.vjs-fullscreen-control, .jw-icon-fullscreen, .plyr__control[data-plyr="fullscreen"], .vp-fullscreen, .fullscreen-button, .fs-btn, .fp-fullscreen, .dplayer-full-icon, .mac_fullscreen, [title*="Full" i], [title*="completa" i], [aria-label*="Full" i], [aria-label*="completa" i], button[class*="fullscreen" i], [class*="fullscreen" i] button');
          if(fsBtn) {
            try { fsBtn.click(); fullscreenClicked = true; } catch(e) {}
          }
        }

        if (videoEl) {
          try {
            if (videoEl.requestFullscreen) videoEl.requestFullscreen();
            else if (videoEl.webkitEnterFullscreen) videoEl.webkitEnterFullscreen();
          } catch(e) {}

          videoEl.style.position = 'fixed';
          videoEl.style.top = '0';
          videoEl.style.left = '0';
          videoEl.style.width = '100vw';
          videoEl.style.height = '100vh';
          videoEl.style.zIndex = '99999999';
          videoEl.style.backgroundColor = '#000';
          videoEl.style.objectFit = 'contain';
        }

        try { window.top.postMessage('APAGAR_ESCANER', '*'); } catch(e) {}
        clearInterval(fastInterval);
      };

      const skipKeywords = ['skip', 'saltar', 'omitir', 'close', 'cerrar', 'x', 'ad-skip', 'skip-ad'];
      const playSelectors = [
        '.vjs-big-play-button', '.jw-icon-display', '.plyr__control--overlaid', 
        '.play-btn', '#play-button', '.voe-play', '.vjs-play-control', 
        '.vp-video-wrapper', '.vp-telecine', '#player-preload', '.play-button', 
        '.button-play', '.vjs-tech'
      ];

      function cleanOverlays() {
        const elements = document.querySelectorAll('div, a, button, span');
        elements.forEach(el => {
          const style = window.getComputedStyle(el);
          const zIndex = parseInt(style.zIndex);
          const text = (el.innerText || '').toLowerCase();
          const className = (el.className || '').toString().toLowerCase();

          if (skipKeywords.some(w => text.includes(w) || className.includes(w))) {
            try { el.click(); } catch(e) {}
          }

          if ((style.position === 'absolute' || style.position === 'fixed') && zIndex > 90) {
            if (!el.querySelector('video') && !el.querySelector('iframe')) {
              el.style.pointerEvents = 'none'; 
              if (!skipKeywords.some(w => text.includes(w))) {
                el.remove();
              }
            }
          }
        });
      }

      const startPlayer = () => {
        if (isPlayingNotified) return;
        if (attempts > 35) { clearInterval(fastInterval); return; }

        cleanOverlays();

        const video = document.querySelector('video');
        const iframe = document.querySelector('iframe');
        
        const castButtons = document.querySelectorAll('.jw-icon-airplay, .jw-icon-cast, .vjs-chromecast-button, google-cast-launcher, [aria-label*="AirPlay"], [aria-label*="Cast"]');
        castButtons.forEach(btn => btn.remove());

        // 1. CLICK AL BOTON DE PANTALLA COMPLETA DIRECTAMENTE AL CARGAR
        if (!fullscreenClicked) {
          const fsBtn = document.querySelector('.vjs-fullscreen-control, .jw-icon-fullscreen, .plyr__control[data-plyr="fullscreen"], .vp-fullscreen, .fullscreen-button, .fs-btn, .fp-fullscreen, .dplayer-full-icon, .mac_fullscreen, [title*="Full" i], [title*="completa" i], [aria-label*="Full" i], [aria-label*="completa" i], button[class*="fullscreen" i], [class*="fullscreen" i] button');
          if (fsBtn) {
            try { 
              fsBtn.click(); 
              fullscreenClicked = true; 
            } catch(e) {}
          }
        }

        if (!video && iframe) {
           iframe.style.position = 'fixed';
           iframe.style.top = '0';
           iframe.style.left = '0';
           iframe.style.width = '100vw';
           iframe.style.height = '100vh';
           iframe.style.zIndex = '999999';
           iframe.style.backgroundColor = '#000';
           iframe.style.border = 'none';
        }

        if (video) {
          video.removeAttribute('x-webkit-airplay');
          video.setAttribute('disableRemotePlayback', 'true');
          video.setAttribute('x-webkit-airplay', 'deny');
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');

          if (!video.hasAttribute('data-listeners-attached')) {
            video.setAttribute('data-listeners-attached', 'true');
            video.addEventListener('playing', () => triggerPlaybackFound(video));
            video.addEventListener('timeupdate', () => {
              if (video.currentTime > 0.1) triggerPlaybackFound(video);
            });
            if (video.readyState >= 3) triggerPlaybackFound(video);
          }

          if (video.paused && attempts > 1) {
            video.play().catch(e => {});
          }
          
          const isActuallyPlaying = !video.paused && (video.currentTime > 0.1 || video.readyState > 2);
          
          if (isActuallyPlaying && !isPlayingNotified) {
             triggerPlaybackFound(video);
          }
        } 
        
        if (attempts > 1 && !isPlayingNotified) {
          playSelectors.forEach(selector => {
            const btn = document.querySelector(selector);
            if (btn && (!btn.className || (!btn.className.includes('cast') && !btn.className.includes('airplay')))) {
               try { btn.click(); } catch(e) {}
            }
          });
        }
        attempts++;
      };

      fastInterval = setInterval(startPlayer, 800); 

      // PROTECCIÓN DE CONTROL REMOTO TV (FASE DE CAPTURA)
      // Asegura que al presionar OK/Enter SOLO pause/reproduzca el video y no haga clic en un anuncio oculto
      const blockAdsOnEnter = function(e) {
        if(e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 66 || e.keyCode === 23) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };

      window.addEventListener('keydown', function(e) {
        if(e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 66 || e.keyCode === 23) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const v = document.querySelector('video');
          if(v) { 
            if(v.paused) v.play(); else v.pause(); 
          } 
        }
      }, true);
      
      window.addEventListener('keyup', blockAdsOnEnter, true);
      window.addEventListener('keypress', blockAdsOnEnter, true);

    })();
    true;
  `;

  const handleMessage = (event: any) => {
    const msg = event.nativeEvent.data;
    if (msg === 'video_playing') setIsVideoPlaying(true);
    if (msg.startsWith('dash_log:')) console.log('[ShakaPlayer]', msg.replace('dash_log:', ''));
  };

  const handleShouldStartLoadWithRequest = (request: any) => {
    const url = request.url.toLowerCase();

    if (url.includes('vimeus') || url.includes('adcash') || url.includes('popads')) return false;
    if (url.startsWith('intent://') || url.startsWith('market://') || url.includes('play.google.com')) return false;

    if (isLocked && request.isTopFrame) {
      const originalDomain = cleanUrl.split('/')[2];
      if (originalDomain && !url.includes(originalDomain) && !url.includes('about:blank') && !url.includes('vimeo.com') && !url.includes('mp4')) return false;
    }
    return true;
  };

  if (!cleanUrl) return <View className="flex-1 bg-black items-center justify-center"><AlertCircle color="#FACC15" size={64} /></View>;

  const isWaitScreenVisible = !isDash && !isDirectVideo && !isVideoPlaying;

  return (
    <View className="flex-1 bg-black">
      {isDash ? (() => {
        return (
          <View style={StyleSheet.absoluteFillObject} className="bg-black">
            {(!isVideoPlaying) && (
              <View style={StyleSheet.absoluteFillObject} className="bg-[#050505] items-center justify-center z-40 absolute">
                <ActivityIndicator size="large" color="#FACC15" className="mb-4" />
                <Text className="text-vortex-yellow font-black text-xl uppercase tracking-widest drop-shadow-md">
                  Conectando al Servidor DRM...
                </Text>
              </View>
            )}
            <Video
              source={{ uri: finalUrl }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="contain"
              drm={drmConfig as any}
              controls={true}
              onLoad={() => setIsVideoPlaying(true)}
            />
          </View>
        );
      })() : isDirectVideo ? (
        <Video style={StyleSheet.absoluteFillObject} source={{ uri: cleanUrl }} controls={true} resizeMode="contain" />
      ) : (
        <View style={StyleSheet.absoluteFillObject} className="bg-black">

          {isWaitScreenVisible && (
            <View style={StyleSheet.absoluteFillObject} className="bg-[#050505] items-center justify-center z-40 absolute">
              <ActivityIndicator size="large" color="#FACC15" className="mb-4" />
              <Text className="text-vortex-yellow font-black text-xl uppercase tracking-widest drop-shadow-md">
                Conectando al Servidor...
              </Text>
              <Text className="text-gray-400 text-xs mt-2 text-center max-w-[80%]">
                Ajustando el reproductor a pantalla completa y bloqueando anuncios molestos.
              </Text>
            </View>
          )}

          <WebView
            ref={webViewRef}
            source={{ uri: cleanUrl }}
            style={{ flex: 1, backgroundColor: 'black', opacity: isWaitScreenVisible ? 0 : 1 }}
            allowsFullscreenVideo={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            allowsAirPlayForMediaPlayback={false}
            domStorageEnabled={true}
            javaScriptEnabled={true}
            androidLayerType="hardware"
            mixedContentMode="always"
            injectedJavaScriptBeforeContentLoaded={beforeLoadJS}
            injectedJavaScript={afterLoadJS}
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