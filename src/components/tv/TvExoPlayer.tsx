/**
 * TvExoPlayer.tsx
 * Reproductor nativo TV — react-native-video (ExoPlayer avanzado en Android)
 * Características:
 *  - Buffer configurado: 15s antes de reproducir (estilo Netflix)
 *  - Overlay D-Pad: aparece con OK, se oculta a los 5s
 *  - Auto-reconnect: hasta 3 reintentos en caso de error
 *  - Keep-awake: pantalla activa mientras reproduce
 *  - Estados: buffering / playing / error
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, Animated, BackHandler
} from 'react-native';

const TVEventHandler = require('react-native').TVEventHandler;
import Video, { OnVideoErrorData, OnLoadData } from 'react-native-video';
import { useKeepAwake } from 'expo-keep-awake';
import { Play, Pause, SkipForward, Wifi, AlertCircle } from 'lucide-react-native';

interface TvExoPlayerProps {
    url: string;
    title?: string;
    serverIndex?: number;
    serverCount?: number;
    onNextServer?: () => void;
    onBack?: () => void;
    accentColor?: string;
}

const OVERLAY_HIDE_DELAY = 5000;

export default function TvExoPlayer({
    url,
    title = '',
    serverIndex = 0,
    serverCount = 1,
    onNextServer,
    onBack,
    accentColor = '#22c55e',
}: TvExoPlayerProps) {
    useKeepAwake();

    const [showOverlay, setShowOverlay] = useState(true);
    const [isBuffering, setIsBuffering] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    // Para forzar la re-renderización del Video component (reconnect)
    const [playerKey, setPlayerKey] = useState(0);

    const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const overlayAnim = useRef(new Animated.Value(1)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const playerRef = useRef<React.ElementRef<typeof Video>>(null);

    // ─── Pulse animación del indicador LIVE ──────────────────────────────────
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 0.2, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    // ─── Reset states on URL change ──────────────────────────────────────────
    useEffect(() => {
        setHasError(false);
        setRetryCount(0);
        setIsBuffering(true);
        setShowOverlay(true);
        setIsPaused(false);
        setPlayerKey(k => k + 1);
    }, [url]);

    // ─── Auto-reconnect (máx 3 reintentos) ───────────────────────────────────
    const handleError = useCallback((err: OnVideoErrorData) => {
        console.log('[TvExoPlayer] Error en stream nativo:', err);
        if (retryCount < 3) {
            console.log(`[TvExoPlayer] Auto-reconnect ${retryCount + 1}/3`);
            setRetryCount(r => r + 1);
            setIsBuffering(true);
            setTimeout(() => {
                setPlayerKey(k => k + 1); // Fuerza desmontar/montar
            }, 2000);
        } else {
            console.log('[TvExoPlayer] Error terminal tras reintentos');
            setHasError(true);
            setIsBuffering(false);
        }
    }, [retryCount]);

    const handleLoad = useCallback((data: OnLoadData) => {
        setIsBuffering(false);
        setHasError(false);
        // Si recupera la conexión, borramos los reintentos
        setRetryCount(0);
    }, []);

    const handleBuffer = useCallback((e: { isBuffering: boolean }) => {
        setIsBuffering(e.isBuffering);
    }, []);

    // ─── Overlay: mostrar/ocultar ────────────────────────────────────────────
    const showOverlayMomentarily = useCallback(() => {
        if (overlayTimer.current) clearTimeout(overlayTimer.current);
        setShowOverlay(true);
        Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        overlayTimer.current = setTimeout(() => {
            Animated.timing(overlayAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
                setShowOverlay(false);
            });
        }, OVERLAY_HIDE_DELAY);
    }, [overlayAnim]);

    useEffect(() => {
        showOverlayMomentarily();
        return () => { if (overlayTimer.current) clearTimeout(overlayTimer.current); };
    }, [showOverlayMomentarily]);

    // ─── D-Pad handler (TVEventHandler.addListener) ──────────────────────────
    useEffect(() => {
        const sub = (TVEventHandler as any).addListener?.((event: any) => {
            const type = event?.eventType;
            if (!type) return;

            showOverlayMomentarily();

            if (type === 'select' || type === 'playPause') {
                setIsPaused(p => !p);
            }
            if (type === 'right' && onNextServer) {
                onNextServer();
            }
        });
        return () => sub?.remove?.();
    }, [onNextServer, showOverlayMomentarily]);

    // ─── Back button ─────────────────────────────────────────────────────────
    useEffect(() => {
        const back = BackHandler.addEventListener('hardwareBackPress', () => {
            if (onBack) { onBack(); return true; }
            return false;
        });
        return () => back.remove();
    }, [onBack]);

    // ─── Error final ─────────────────────────────────────────────────────────
    if (hasError) {
        return (
            <View style={styles.centered}>
                <AlertCircle color="#ef4444" size={54} />
                <Text style={styles.errorTitle}>Stream no disponible</Text>
                <Text style={styles.errorSub}>
                    {onNextServer
                        ? 'Presioná → para intentar con el siguiente servidor'
                        : 'No se pudo conectar al stream'}
                </Text>
                {onNextServer && serverIndex < serverCount - 1 && (
                    <View style={[styles.nextBtn, { backgroundColor: accentColor }]}>
                        <SkipForward color="#000" size={16} />
                        <Text style={styles.nextBtnText}>Siguiente Servidor</Text>
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Video nativo react-native-video (ExoPlayer) */}
            <Video
                key={`player-${playerKey}`}
                ref={playerRef}
                source={{ uri: url }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="contain"
                paused={isPaused}
                repeat={false}
                controls={false}
                bufferConfig={{
                    minBufferMs: 15000, // 15s mínimo antes de arrancar
                    maxBufferMs: 50000, // 50s máximo guardado
                    bufferForPlaybackMs: 2500, // Comienza a reproducir al tener 2.5s
                    bufferForPlaybackAfterRebufferMs: 5000, // Retoma tras corte con 5s
                }}
                onLoad={handleLoad}
                onBuffer={handleBuffer}
                onError={handleError}
            />

            {/* Buffering loader */}
            {isBuffering && (
                <View style={styles.bufferingOverlay}>
                    <View style={styles.bufferingBox}>
                        <Animated.View style={[styles.liveDot, { opacity: pulseAnim, backgroundColor: accentColor }]} />
                        <Text style={[styles.bufferingText, { color: accentColor }]}>
                            {retryCount > 0 ? `Reconectando... (${retryCount}/3)` : 'Cargando stream...'}
                        </Text>
                    </View>
                </View>
            )}

            {/* Overlay D-Pad */}
            {showOverlay && (
                <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
                    {/* Header */}
                    <View style={styles.overlayHeader}>
                        <View style={[styles.liveBadge, { borderColor: accentColor }]}>
                            <Animated.View style={[styles.liveDot, { opacity: pulseAnim, backgroundColor: accentColor }]} />
                            <Text style={[styles.liveText, { color: accentColor }]}>EN VIVO</Text>
                        </View>
                        <View style={styles.serverBadge}>
                            <Wifi color="#9CA3AF" size={12} />
                            <Text style={styles.serverText}>
                                Servidor {serverIndex + 1}/{serverCount}
                            </Text>
                        </View>
                    </View>

                    {/* Título */}
                    <Text style={styles.overlayTitle} numberOfLines={2}>{title}</Text>

                    {/* Controles */}
                    <View style={styles.controls}>
                        <View style={styles.controlHint}>
                            {isPaused
                                ? <Play color="#fff" size={18} fill="#fff" />
                                : <Pause color="#fff" size={18} fill="#fff" />
                            }
                            <Text style={styles.controlText}>OK — {isPaused ? 'Reproducir' : 'Pausar'}</Text>
                        </View>
                        {onNextServer && serverIndex < serverCount - 1 && (
                            <View style={styles.controlHint}>
                                <SkipForward color="#9CA3AF" size={16} />
                                <Text style={[styles.controlText, { color: '#9CA3AF' }]}>→ Siguiente servidor</Text>
                            </View>
                        )}
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    centered: { flex: 1, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', padding: 32 },
    errorTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 20, marginBottom: 8 },
    errorSub: { color: '#6B7280', fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 360 },
    nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 24 },
    nextBtnText: { color: '#000', fontSize: 14, fontWeight: '900' },

    bufferingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    bufferingBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, gap: 12 },
    bufferingText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },

    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', padding: 32, backgroundColor: 'rgba(0,0,0,0.5)' },
    overlayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
    liveDot: { width: 7, height: 7, borderRadius: 4 },
    liveText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
    serverBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
    serverText: { color: '#9CA3AF', fontSize: 11, fontWeight: '700' },

    overlayTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },

    controls: { flexDirection: 'row', gap: 24, alignItems: 'center' },
    controlHint: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    controlText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
