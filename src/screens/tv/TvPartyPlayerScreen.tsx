import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, ActivityIndicator,
  StyleSheet, BackHandler, Animated,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { ShieldCheck, Users } from 'lucide-react-native';
import {
  collection, onSnapshot, query, orderBy,
  doc, updateDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAppStore } from '../../store/useAppStore';
import { Video, ResizeMode } from 'expo-av';


const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Mensaje flotante estilo Twitch ───────────────────────────────────────────
const FloatingMessage = ({ msg }: { msg: any }) => {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(5000),
      Animated.timing(fade, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[fs.floatMsg, { opacity: fade }]}>
      <Text style={fs.floatUser}>{msg.user}:</Text>
      <Text style={fs.floatText}> {msg.text}</Text>
    </Animated.View>
  );
};

export default function TvPartyPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const webViewRef = useRef<WebView>(null);
  const videoRef = useRef<Video>(null);
  const lastSyncTime = useRef(0);

  const { videoUrl, roomCode, isHost } = route.params;
  const currentProfile = useAppStore(state => state.currentProfile);
  const displayName = currentProfile?.name || 'Invitado';

  const [messages, setMessages] = useState<any[]>([]);
  const [partyState, setPartyState] = useState<any>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);


  let cleanUrl = videoUrl ? videoUrl.trim() : '';
  if (cleanUrl && cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
  else if (cleanUrl && !cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;

  const urlToPlay = (!isHost && partyState?.videoUrl) ? partyState.videoUrl : cleanUrl;
  const isDirect = urlToPlay.toLowerCase().includes('.mp4') || urlToPlay.toLowerCase().includes('.m3u8');
  const isLamovie = urlToPlay.toLowerCase().includes('lamovie') || urlToPlay.toLowerCase().includes('lamov');
  const timeoutDuration = isLamovie ? 35000 : 10000;

  // ─── Firestore: Init (Host) / Subscribe (Guest) ──────────────────────────────
  useEffect(() => {
    if (!roomCode) return;
    if (isHost) {
      updateDoc(doc(db, 'parties', roomCode), {
        isPlaying: true, currentTime: 0, updatedAt: Date.now(),
      }).catch(() => {});
    } else {
      const unsub = onSnapshot(doc(db, 'parties', roomCode), snap => {
        if (snap.exists()) setPartyState(snap.data());
      });
      return () => unsub();
    }
  }, [roomCode, isHost]);

  // ─── Firestore: mensajes en tiempo real ─────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return;
    const q = query(collection(db, 'parties', roomCode, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        isMe: d.data().user === displayName,
      }));
      setMessages(msgs);
    });
    return () => unsub();
  }, [roomCode, displayName]);

  // ─── Sincronizar Guest cuando partyState cambia ─────────────────────────────
  useEffect(() => {
    if (!isHost && partyState && webViewRef.current && isVideoPlaying) {
      webViewRef.current.injectJavaScript(`
        var v=document.querySelector('video');
        if(v){
          if(${partyState.isPlaying}&&v.paused)v.play();
          else if(!${partyState.isPlaying}&&!v.paused)v.pause();
          if(Math.abs(v.currentTime-${partyState.currentTime})>3)v.currentTime=${partyState.currentTime};
        }
      `);
    }
  }, [partyState, isHost, isVideoPlaying]);

  // ─── Actualizar Firestore (Host escribe estado) ─────────────────────────────
  const updatePlaybackState = useCallback((playing: boolean, time: number) => {
    if (!isHost || !roomCode) return;
    const now = Date.now();
    if (now - lastSyncTime.current < 1000) return;
    lastSyncTime.current = now;
    updateDoc(doc(db, 'parties', roomCode), {
      isPlaying: playing, currentTime: time, updatedAt: now,
    }).catch(() => {});
  }, [isHost, roomCode]);



  // ─── Timers ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let m = true;
    const t1 = setTimeout(() => { if (m) setIsLocked(true); }, 2000);
    const t2 = setTimeout(() => { if (m) setIsVideoPlaying(true); }, timeoutDuration);
    return () => { m = false; clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { navigation.goBack(); return true; });
    return () => sub.remove();
  }, [navigation]);

  // ─── WebView Messages ──────────────────────────────────────────────────────
  const handleMessage = (event: any) => {
    const data = event.nativeEvent.data;
    if (data === 'video_playing') {
      setIsVideoPlaying(true);
    } else if (data.startsWith('syncState:')) {
      const parts = data.replace('syncState:', '').split(',');
      const playing = parts[0] === 'true';
      const time = parseFloat(parts[1]);
      updatePlaybackState(playing, time);
    }
  };

  const handleShouldStartLoad = (req: any) => {
    const url = req.url.toLowerCase();
    if (url.includes('adcash') || url.includes('popads') || url.startsWith('intent://') || url.startsWith('market://')) return false;
    if (isLocked && req.isTopFrame) {
      const domain = cleanUrl.split('/')[2];
      if (domain && !url.includes(domain) && !url.includes('vimeo.com') && !url.includes('mp4')) return false;
    }
    return true;
  };

  const isWaiting = !isDirect && !isVideoPlaying;

  // ─── JS Inyectado ──────────────────────────────────────────────────────────
  // NO intercepta teclas: el control nativo funciona normal.
  // Solo escucha eventos play/pause/timeupdate del <video> para sincronizar a Firestore.
  const beforeLoadJS = `
    window.open=function(){return null};
    window.alert=function(){};window.confirm=function(){};window.prompt=function(){};
    document.addEventListener('click',function(e){var a=e.target.closest('a');if(a){e.preventDefault();e.stopPropagation();}},true);
    true;
  `;

  const afterLoadJS = `
    (function(){
      document.body.style.backgroundColor='#000';
      document.body.style.overflow='hidden';
      var notified=false,attempts=0;
      var isHost=${isHost ? 'true' : 'false'};

      function found(v){
        if(notified)return; notified=true;
        window.ReactNativeWebView.postMessage('video_playing');
        if(v){
          v.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999999;background:#000;object-fit:contain;';
          try{v.requestFullscreen&&v.requestFullscreen();}catch(e){}
        }
      }

      // Host: escuchar play/pause/seek nativos y reportar a RN → Firestore
      function attachHost(v){
        if(!isHost||v.dataset.ha)return; v.dataset.ha='1';
        v.addEventListener('play',function(){window.ReactNativeWebView.postMessage('syncState:true,'+v.currentTime);});
        v.addEventListener('pause',function(){window.ReactNativeWebView.postMessage('syncState:false,'+v.currentTime);});
        v.addEventListener('seeked',function(){window.ReactNativeWebView.postMessage('syncState:'+(!v.paused)+','+v.currentTime);});
        var lt=0;
        v.addEventListener('timeupdate',function(){
          if(Date.now()-lt>3000){window.ReactNativeWebView.postMessage('syncState:'+(!v.paused)+','+v.currentTime);lt=Date.now();}
        });
      }

      var t=setInterval(function(){
        if(notified||attempts>40){clearInterval(t);return;} attempts++;
        var v=document.querySelector('video');
        var iframe=document.querySelector('iframe');
        if(v){
          if(!v.dataset.la){
            v.dataset.la='1';
            v.addEventListener('playing',function(){found(v);});
            v.addEventListener('timeupdate',function(){if(v.currentTime>.1)found(v);});
            if(v.readyState>=3)found(v);
            attachHost(v);
          }
          if(v.paused&&attempts>2)try{v.play();}catch(e){}
        }
        if(!v&&iframe){Object.assign(iframe.style,{position:'fixed',top:'0',left:'0',width:'100vw',height:'100vh',zIndex:'99999',border:'none',background:'#000'});}
      },800);

    })();true;
  `;

  // Solo mostrar los últimos 5 mensajes (los más recientes flotan)
  const recentMessages = messages.slice(-5);

  return (
    <View style={fs.root}>

      {/* ── VIDEO (ocupa todo) ─────────────────────────────────────────── */}
      {isDirect ? (
        <Video
          ref={videoRef}
          source={{ uri: cleanUrl }}
          style={StyleSheet.absoluteFillObject}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={isHost}
          onPlaybackStatusUpdate={(status: any) => {
            if (!status.isLoaded) return;
            if (isHost) updatePlaybackState(status.isPlaying, status.positionMillis / 1000);
            else if (!isHost && partyState && videoRef.current) {
              if (partyState.isPlaying !== status.isPlaying)
                partyState.isPlaying ? videoRef.current.playAsync() : videoRef.current.pauseAsync();
              if (Math.abs((status.positionMillis / 1000) - partyState.currentTime) > 3)
                videoRef.current.setPositionAsync(partyState.currentTime * 1000);
            }
          }}
        />
      ) : (
        <>
          {isWaiting && (
            <View style={fs.loadingOverlay}>
              <ActivityIndicator size="large" color="#B026FF" />
              <Text style={fs.loadingText}>Preparando Sala...</Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: cleanUrl, headers: { Referer: cleanUrl.split('/').slice(0, 3).join('/') + '/' } }}
            style={{ flex: 1, backgroundColor: '#000', opacity: isWaiting ? 0 : 1 }}
            userAgent={CHROME_UA}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsAirPlayForMediaPlayback={false}
            domStorageEnabled javaScriptEnabled thirdPartyCookiesEnabled sharedCookiesEnabled
            androidLayerType="hardware"
            mixedContentMode="always"
            injectedJavaScriptBeforeContentLoaded={beforeLoadJS}
            injectedJavaScript={afterLoadJS}
            injectedJavaScriptForMainFrameOnly={false}
            onMessage={handleMessage}
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
          />
        </>
      )}

      {/* ── CHAT FLOTANTE ESTILO TWITCH (mensajes transparentes) ──────── */}
      <View style={fs.floatChat} pointerEvents="none">
        {recentMessages.map(msg => (
          <FloatingMessage key={msg.id} msg={msg} />
        ))}
      </View>

      {/* ── INDICADOR SALA + HOST BADGE (esquina superior derecha) ────── */}
      <View style={fs.roomBadge}>
        <Users color="#B026FF" size={14} />
        <Text style={fs.roomBadgeText}>{roomCode}</Text>
        {isHost && (
          <View style={fs.hostTag}>
            <ShieldCheck size={10} color="#B026FF" />
            <Text style={fs.hostTagText}>HOST</Text>
          </View>
        )}
      </View>



    </View>
  );
}

// ─── Estilos ────────────────────────────────────────────────────────────────
const fs = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: '#050505',
    alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  loadingText: { color: '#B026FF', fontWeight: '900', fontSize: 16, marginTop: 14, letterSpacing: 2 },

  // Chat flotante transparente (Twitch-style)
  floatChat: {
    position: 'absolute', bottom: 80, left: 20,
    maxWidth: '50%',
  },
  floatMsg: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, marginBottom: 6,
    alignSelf: 'flex-start',
  },
  floatUser: { color: '#B026FF', fontWeight: '800', fontSize: 13 },
  floatText: { color: '#e5e7eb', fontWeight: '500', fontSize: 13 },

  // Room badge (esquina superior derecha)
  roomBadge: {
    position: 'absolute', top: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  roomBadgeText: { color: '#e5e7eb', fontSize: 12, fontWeight: '700' },
  hostTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(176,38,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(176,38,255,0.4)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12,
  },
  hostTagText: { color: '#B026FF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },


});