import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, BackHandler } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { ShieldCheck, Users } from 'lucide-react-native';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAppStore } from '../../store/useAppStore';
import { Video, ResizeMode } from 'expo-av';

export default function TvPartyPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const webViewRef = useRef<WebView>(null);
  const flatListRef = useRef<FlatList>(null);

  const { videoUrl, roomCode } = route.params;
  const currentProfile = useAppStore(state => state.currentProfile);

  const [messages, setMessages] = useState<any[]>([]);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const cleanUrl = videoUrl ? videoUrl.trim() : '';
  const isDirect = cleanUrl.toLowerCase().includes('.mp4') || cleanUrl.toLowerCase().includes('.m3u8');

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

  useEffect(() => {
    if (!roomCode) return;
    const q = query(collection(db, 'parties', roomCode, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        isMe: doc.data().user === (currentProfile?.name || 'Invitado')
      }));
      setMessages(loadedMessages);
    });
    return () => unsubscribe();
  }, [roomCode]);

  const beforeLoadJS = `
    window.open = function() { return null; };
    window.alert = function() { return null; };
    window.confirm = function() { return null; };
    window.prompt = function() { return null; };
    
    if (window.HTMLVideoElement) {
      window.HTMLVideoElement.prototype.webkitShowPlaybackTargetPicker = function() { return null; };
    }
    window.WebKitPlaybackTargetAvailabilityEvent = undefined;

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

      // PROTECCIÓN DE CONTROL REMOTO TV
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
    if (event.nativeEvent.data === 'video_playing') setIsVideoPlaying(true);
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

  const isWaitScreenVisible = !isDirect && !isVideoPlaying;

  return (
    <View className="flex-1 bg-black flex-row">

      {/* SECCIÓN DEL REPRODUCTOR (Ocupa el 75%) */}
      <View style={{ flex: 0.75 }} className="bg-black relative">
        {isDirect ? (
          <Video source={{ uri: cleanUrl }} style={StyleSheet.absoluteFillObject} useNativeControls={true} resizeMode={ResizeMode.CONTAIN} shouldPlay={true} />
        ) : (
          <View style={StyleSheet.absoluteFillObject} className="bg-black">
            {isWaitScreenVisible && (
              <View style={StyleSheet.absoluteFillObject} className="bg-[#050505] items-center justify-center z-40 absolute">
                <ActivityIndicator size="large" color="#FACC15" className="mb-6" />
                <Text className="text-vortex-yellow font-black text-xl tracking-widest uppercase">
                  Preparando Sala y Video...
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

      {/* SECCIÓN DEL CHAT LADO DERECHO (Ocupa el 25%) */}
      <View style={{ flex: 0.25 }} className="bg-[#111] border-l border-white/10 pt-8 px-4 pb-4">
        <View className="flex-row items-center justify-center mb-6 border-b border-white/10 pb-6">
          <Users color="#A855F7" size={24} />
          <Text className="text-white font-black text-xl ml-3">Sala <Text className="text-purple-400">{roomCode}</Text></Text>
        </View>

        <FlatList
          ref={flatListRef} data={messages} keyExtractor={(item, index) => item.id || index.toString()} showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListEmptyComponent={<Text className="text-gray-500 text-center mt-10">La sala está vacía. Invita a tus amigos.</Text>}
          renderItem={({ item }) => (
            <View className={`mb-4 ${item.isMe ? 'self-end' : 'self-start'}`}>
              <Text className={`text-[10px] mb-1 font-bold ${item.isMe ? 'hidden' : 'text-purple-400'}`}>{item.user}</Text>
              <View className={`px-4 py-3 rounded-2xl max-w-[90%] ${item.isMe ? 'bg-purple-600 rounded-tr-sm' : 'bg-gray-800 rounded-tl-sm'}`}>
                <Text className="text-white text-sm font-medium">{item.text}</Text>
              </View>
            </View>
          )}
        />

        <View className="mt-4 bg-[#222] p-4 rounded-xl border border-white/5 items-center">
          <Text className="text-gray-400 text-xs text-center font-bold">Modo Lectura (TV)</Text>
          <Text className="text-gray-500 text-[10px] text-center mt-1">Usa tu teléfono para enviar mensajes al chat.</Text>
        </View>
      </View>

    </View>
  );
}