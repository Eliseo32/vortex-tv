import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, BackHandler, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import { AlertCircle } from 'lucide-react-native';
import TvFocusable from '../../components/tv/TvFocusable';
import TvPlayerOverlay, { handleOverlayMessage, QualityLevel } from '../../components/tv/TvPlayerOverlay';

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function TvDrmPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const webViewRef = useRef<WebView>(null);
  const { videoUrl } = route.params;

  // ── State ──────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [showOverlayTrigger, setShowOverlayTrigger] = useState(0);

  // ── URL Parsing ────────────────────────────────────────────────────────
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

  console.log('[DrmPlayer] finalUrl:', finalUrl);
  console.log('[DrmPlayer] drmKeyId:', drmKeyId, '| drmKey:', drmKey);



  // ── Back Handler ───────────────────────────────────────────────────────
  useEffect(() => {
    const backAction = () => { navigation.goBack(); return true; };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [navigation]);



  // ── WebView Messages ─────────────────────────────────────────────────
  const onMessage = (event: any) => {
    const msg = event.nativeEvent.data;
    if (msg.startsWith('shaka_log:')) {
      console.log('[ShakaPlayer]', msg.slice(10));
    } else if (msg === 'cmd_open_controls') {
      setShowOverlayTrigger(t => t + 1);
    } else if (msg.startsWith('ERROR:')) {
      setHasError(true);
      setIsLoading(false);
      setErrorMsg(msg.slice(6));
    } else if (msg === 'VIDEO_WAITING') {
      setIsLoading(true);
    } else {
      handleOverlayMessage(msg, {
        setCurrentTime,
        setDuration,
        setIsPaused,
        setQualityLevels,
        setIsPlaying: (v) => { if (v) setIsLoading(false); },
      });
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ── SHAKA PLAYER HTML ─────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const getShakaHtml = () => {
    return `
    <!DOCTYPE html>
    <html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{width:100%;height:100%;overflow:hidden;background:#000}
        video{width:100%;height:100%;object-fit:contain;background:#000}
      </style>
    </head>
    <body>
      <video id="video" autoplay></video>
      <script>
        var player = null;
        var video = null;
        var shakaLoaded = false;
        function log(m) { window.ReactNativeWebView.postMessage('shaka_log:' + m); }
        function onShakaError() {
          log('ERROR: Failed to load Shaka script from CDN');
          window.ReactNativeWebView.postMessage('ERROR:No se pudo cargar Shaka Player desde CDN');
        }
        function onShakaLoaded() {
          log('Shaka script loaded! typeof shaka=' + typeof shaka);
          shakaLoaded = true;
          init();
        }
        log('HTML loaded, fetching shaka-player.compiled.js...');
      <\/script>
      <script src="https://cdn.jsdelivr.net/npm/shaka-player@4.7.11/dist/shaka-player.compiled.js" onload="onShakaLoaded()" onerror="onShakaError()"><\/script>
      <script>

        function init() {
          try {
            if (typeof shaka === 'undefined') {
              log('ERROR: shaka still undefined after onload');
              window.ReactNativeWebView.postMessage('ERROR:Shaka Player no disponible');
              return;
            }
            log('STEP1 init() polyfills...');
            shaka.polyfills.installAll();
            log('STEP2 polyfills OK');

            if (!shaka.Player.isBrowserSupported()) {
              log('ERROR: Browser not supported');
              window.ReactNativeWebView.postMessage('ERROR:Navegador no compatible');
              return;
            }
            log('STEP3 browser supported');

            video = document.getElementById('video');
            player = new shaka.Player(video);
            log('STEP4 Player created');

            // === ClearKey DRM ===
            ${drmKeyId && drmKey ? `
            player.configure({
              drm: {
                clearKeys: { '${drmKeyId}': '${drmKey}' }
              },
              abr: {
                enabled: true,
                defaultBandwidthEstimate: 500000
              }
            });
            log('STEP5 ClearKey + low quality configured');
            ` : `
            player.configure({
              abr: { enabled: true, defaultBandwidthEstimate: 500000 }
            });
            log('STEP5 No DRM, low quality configured');
            `}

            // === Referer header ===
            ${drmReferer ? `
            player.getNetworkingEngine().registerRequestFilter(function(type, request) {
              request.headers['Referer'] = '${drmReferer}';
              request.headers['Origin'] = '${drmReferer}';
            });
            log('STEP5b Referer=${drmReferer}');
            ` : ''}

            // === SPEED FIX (block 1.5x) ===
            try {
              Object.defineProperty(video, 'defaultPlaybackRate', {
                get: function() { return 1.0; },
                set: function() {},
                configurable: true
              });
            } catch(e) {}
            video.playbackRate = 1.0;
            video.addEventListener('ratechange', function() {
              if (video.playbackRate !== 1.0) {
                log('SPEED_FIX: blocked rate=' + video.playbackRate);
                video.playbackRate = 1.0;
              }
            });
            setInterval(function() {
              if (video.playbackRate !== 1.0) video.playbackRate = 1.0;
            }, 500);

            // === Load manifest ===
            log('STEP6 About to load: ${finalUrl}');
            player.load('${finalUrl}').then(function() {
              log('STEP7 Load successful!');
              video.play();
            }).catch(function(e) {
              log('STEP7 Load ERROR: ' + e.message);
              window.ReactNativeWebView.postMessage('ERROR:' + e.message);
            });

            // === Time updates ===
            setInterval(function() {
              if (video) {
                window.ReactNativeWebView.postMessage('TIME:' + video.currentTime + ':' + (video.duration || 0));
              }
            }, 1000);

            // === Events ===
            video.addEventListener('playing', function() { window.ReactNativeWebView.postMessage('VIDEO_PLAYING'); });
            video.addEventListener('pause', function() { window.ReactNativeWebView.postMessage('VIDEO_PAUSED'); });
            video.addEventListener('waiting', function() { window.ReactNativeWebView.postMessage('VIDEO_WAITING'); });

            // === Bridge Commands ===
            window.addEventListener('message', function(e) {
              var cmd = e.data;
              if (cmd === 'CMD_PLAY') { video.play(); }
              else if (cmd === 'CMD_PAUSE') { video.pause(); }
              else if (cmd === 'CMD_SEEK_BACK') { video.currentTime = Math.max(0, video.currentTime - 15); }
              else if (cmd === 'CMD_SEEK_FWD') { video.currentTime += 15; }
              else if (cmd === 'CMD_GET_QUALITIES') {
                var tracks = player.getVariantTracks();
                var levels = tracks.map(function(t, i) {
                  return { index: i, label: t.height >= 1080 ? 'Full HD (1080p)' : t.height >= 720 ? 'HD (720p)' : t.height >= 480 ? 'SD (480p)' : t.height + 'p', active: t.active };
                });
                // Deduplicate by height
                var seen = {};
                levels = levels.filter(function(l) { if (seen[l.label]) return false; seen[l.label] = true; return true; });
                window.ReactNativeWebView.postMessage('QUALITIES:' + JSON.stringify(levels));
              }
              else if (cmd === 'CMD_SET_QUALITY_AUTO') {
                player.configure({ abr: { enabled: true } });
              }
              else if (cmd.startsWith('CMD_SET_QUALITY_')) {
                var idx = parseInt(cmd.replace('CMD_SET_QUALITY_', ''));
                var allTracks = player.getVariantTracks();
                if (allTracks[idx]) {
                  player.configure({ abr: { enabled: false } });
                  player.selectVariantTrack(allTracks[idx], true);
                }
              }
            });

            player.addEventListener('error', function(event) {
              log('PLAYER_ERROR: ' + JSON.stringify(event.detail));
            });

          } catch (ex) {
            log('INIT ERROR: ' + ex.message);
            window.ReactNativeWebView.postMessage('ERROR:' + ex.message);
          }
        }
      <\/script>
    </body></html>
    `;
  };

  // ── No URL ─────────────────────────────────────────────────────────────
  if (!cleanUrl) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle color="#FACC15" size={64} />
        <Text style={styles.errorText}>Sin URL de video</Text>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER ────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      {/* WebView Shaka Player */}
      <WebView
        ref={webViewRef}
        source={{ html: getShakaHtml(), baseUrl: 'https://cdn.jsdelivr.net' }}
        style={StyleSheet.absoluteFillObject}
        javaScriptEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        onMessage={onMessage}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
          setErrorMsg('Error cargando WebView');
        }}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsFullscreenVideo={true}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FACC15" />
          <Text style={styles.loadingText}>Cargando canal...</Text>
        </View>
      )}

      {/* Error Overlay */}
      {hasError && (
        <View style={styles.errorOverlay}>
          <AlertCircle color="#EF4444" size={48} />
          <Text style={styles.errorTitle}>Error de reproducción</Text>
          <Text style={styles.errorDetail}>{errorMsg}</Text>
          <TvFocusable
            onPress={() => navigation.goBack()}
            hasTVPreferredFocus={true}
            style={styles.errorButton}
            focusedStyle={styles.errorButtonFocused}
          >
            {(f) => <Text style={[styles.errorButtonText, f && { color: '#000' }]}>Volver</Text>}
          </TvFocusable>
        </View>
      )}

      {/* ── Shared Controls Overlay ─────────────────────────── */}
      {!hasError && (
        <TvPlayerOverlay
          webViewRef={webViewRef}
          mode="shaka"
          currentTime={currentTime}
          duration={duration}
          isPaused={isPaused}
          qualityLevels={qualityLevels}
          accentColor="#FACC15"
          forceShowTrigger={showOverlayTrigger}
          onBack={() => navigation.goBack()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', zIndex: 40 },
  loadingText: { color: '#FACC15', fontWeight: '900', fontSize: 18, marginTop: 16, letterSpacing: 2, textTransform: 'uppercase' },
  errorContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  errorText: { color: '#FACC15', fontSize: 18, marginTop: 16 },
  errorTitle: { color: '#EF4444', fontSize: 22, fontWeight: '900', marginTop: 16 },
  errorDetail: { color: '#9CA3AF', fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: '70%' },
  errorButton: { marginTop: 24, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, backgroundColor: 'rgba(250,204,21,0.15)', borderWidth: 2, borderColor: 'rgba(250,204,21,0.3)' },
  errorButtonFocused: { backgroundColor: '#FACC15', borderColor: '#FACC15' },
  errorButtonText: { color: '#FACC15', fontSize: 16, fontWeight: '800' },
});
