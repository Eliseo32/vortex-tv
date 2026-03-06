/**
 * TvPlayerOverlay — Overlay de controles compartido para todos los players de VortexTV
 *
 * Se conecta al reproductor a través de un `webViewRef` o callbacks directos.
 *
 * Modos:
 *  - 'shaka' → puente de comandos postMessage (Shaka/DRM/m3u8)
 *  - 'webview' → JS injection directo sobre <video> en una página web
 *  - 'native' → callbacks onPlay/onPause/onSeek para react-native-video
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, Modal, BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import {
    Play, Pause, SkipBack, SkipForward, Settings, X, Check,
    ArrowLeft, Maximize2, Volume2, VolumeX, Server,
} from 'lucide-react-native';
import TvFocusable from './TvFocusable';

// ─── Tokens ──────────────────────────────────────────────────────────────────
const ACCENT = '#FACC15';
const ACCENT_DIM = 'rgba(250,204,21,0.12)';
const ACCENT_BORDER = 'rgba(250,204,21,0.3)';
const BG_OVERLAY = 'rgba(0,0,0,0.55)';
const BTN_BG = 'rgba(255,255,255,0.07)';
const BTN_FOCUSED = 'rgba(255,255,255,0.18)';

const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '00:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

// ─── Types ────────────────────────────────────────────────────────────────────
export type PlayerMode = 'shaka' | 'webview' | 'native';

export interface QualityLevel {
    index: number;
    label: string;
    active: boolean;
}

export interface ServerOption {
    name: string;
    url: string;
}

interface TvPlayerOverlayProps {
    /** Referencia al WebView (required for shaka/webview modes) */
    webViewRef?: React.RefObject<WebView | null>;
    /** Modo del reproductor */
    mode: PlayerMode;
    /** Título del contenido actual */
    title?: string;
    /** Si > 0, muestra el overlay inmediatamente (para cmd_open_controls desde JS) */
    forceShowTrigger?: number;
    /** Tiempo actual en segundos (para modo native) */
    currentTime?: number;
    /** Duración total en segundos (para modo native) */
    duration?: number;
    /** Si está pausado (para modo native) */
    isPaused?: boolean;
    /** Lista de calidades disponibles */
    qualityLevels?: QualityLevel[];
    /** Lista de servidores para cambiar */
    servers?: ServerOption[];
    /** Índice del servidor actual */
    currentServerIndex?: number;
    /** Color de acento personalizado (ej sports usa verde) */
    accentColor?: string;
    /** Callbacks para modo native */
    onPlay?: () => void;
    onPause?: () => void;
    onSeek?: (seconds: number) => void;
    onSelectQuality?: (index: number | 'auto') => void;
    onSelectServer?: (index: number) => void;
    onBack?: () => void;
    /** Tiempo de auto-hide de controles en ms (default 5000) */
    autoHideMs?: number;
    /** Mostrar botón de servidor */
    showServerButton?: boolean;
}

// ─── Componente ────────────────────────────────────────────────────────────────
export default function TvPlayerOverlay({
    webViewRef,
    mode,
    title = '',
    currentTime: externalTime,
    duration: externalDuration,
    isPaused: externalIsPaused,
    qualityLevels: externalQualities = [],
    servers = [],
    currentServerIndex = 0,
    accentColor = ACCENT,
    onPlay,
    onPause,
    onSeek,
    onSelectQuality,
    onSelectServer,
    onBack,
    autoHideMs = 5000,
    forceShowTrigger = 0,
    showServerButton = false,
}: TvPlayerOverlayProps) {
    // ─── State interno ─────────────────────────────────────────────────────
    const [showControls, setShowControls] = useState(true);
    const [isPaused, setIsPaused] = useState(externalIsPaused ?? false);
    const [currentTime, setCurrentTime] = useState(externalTime ?? 0);
    const [duration, setDuration] = useState(externalDuration ?? 0);
    const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>(externalQualities);
    const [showQualityModal, setShowQualityModal] = useState(false);
    const [showServerModal, setShowServerModal] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    // Para dar foco TV al play cuando aparece el overlay
    const [playBtnFocused, setPlayBtnFocused] = useState(false);

    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync props externos (modo native o cuando el padre actualiza)
    useEffect(() => { if (externalTime !== undefined) setCurrentTime(externalTime); }, [externalTime]);
    useEffect(() => { if (externalDuration !== undefined) setDuration(externalDuration); }, [externalDuration]);
    useEffect(() => { if (externalIsPaused !== undefined) setIsPaused(externalIsPaused); }, [externalIsPaused]);
    useEffect(() => { if (externalQualities.length > 0) setQualityLevels(externalQualities); }, [externalQualities]);

    // ─── Auto-hide ─────────────────────────────────────────────────────────
    const showAndResetTimer = useCallback(() => {
        Animated.timing(controlsOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
        setShowControls(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (!showQualityModal && !showServerModal) {
            timeoutRef.current = setTimeout(() => {
                if (!isPaused) {
                    Animated.timing(controlsOpacity, { toValue: 0, duration: 450, useNativeDriver: true })
                        .start(() => setShowControls(false));
                }
            }, autoHideMs);
        }
    }, [isPaused, showQualityModal, showServerModal, autoHideMs]);

    useEffect(() => {
        showAndResetTimer();
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }, [isPaused, showQualityModal, showServerModal]);

    // Forzar visibilidad cuando el padre lo pide + liberar foco del WebView
    useEffect(() => {
        if (forceShowTrigger > 0) {
            showAndResetTimer();
            // 1. Liberar el foco del WebView (blur elemento activo)
            webViewRef?.current?.injectJavaScript(
                '(function(){ try { if(document.activeElement) document.activeElement.blur(); } catch(e){} })(); true;'
            );
            // 2. Dar foco nativo TV al boton Play del overlay con un pequeño delay
            setPlayBtnFocused(false);
            setTimeout(() => setPlayBtnFocused(true), 50);
        }
    }, [forceShowTrigger]);

    // Ref para blur del WebView (sin uso de findNodeHandle)
    const _unused = useRef<any>(null);

    // ─── Comandos al WebView ────────────────────────────────────────────────
    const cmd = useCallback((js: string) => {
        webViewRef?.current?.injectJavaScript(js);
    }, [webViewRef]);

    // ─── Acciones ──────────────────────────────────────────────────────────
    const handlePlayPause = () => {
        showAndResetTimer();
        if (mode === 'shaka') {
            if (isPaused) {
                cmd("window.postMessage('CMD_PLAY','*');true;");
            } else {
                cmd("window.postMessage('CMD_PAUSE','*');true;");
            }
            setIsPaused(p => !p);
        } else if (mode === 'webview') {
            cmd("(function(){var v=document.querySelector('video');if(v){if(v.paused)v.play();else v.pause();}})();true;");
            setIsPaused(p => !p);
        } else {
            if (isPaused) onPlay?.(); else onPause?.();
        }
    };

    const handleSeek = (delta: number) => {
        showAndResetTimer();
        if (mode === 'shaka') {
            cmd(`window.postMessage('CMD_SEEK:${delta}','*');true;`);
        } else if (mode === 'webview') {
            cmd(`(function(){var v=document.querySelector('video');if(v)v.currentTime+=${delta};})();true;`);
        } else {
            onSeek?.(delta);
        }
    };

    const handleMute = () => {
        showAndResetTimer();
        const next = !isMuted;
        setIsMuted(next);
        if (mode === 'shaka') {
            cmd(`window.postMessage('CMD_${next ? 'MUTE' : 'UNMUTE'}','*');true;`);
        } else if (mode === 'webview') {
            cmd(`(function(){var v=document.querySelector('video');if(v)v.muted=${next};})();true;`);
        }
    };

    const handleOpenQuality = () => {
        showAndResetTimer();
        if (mode === 'shaka') {
            cmd("window.postMessage('CMD_GET_QUALITIES','*');true;");
        } else if (mode === 'webview') {
            // Intentar Shaka o JW en la página
            cmd(`
                (function(){
                    if(window.player&&window.player.getVariantTracks){
                        var tr=window.player.getVariantTracks();
                        var seen={};
                        var list=tr.filter(function(t){var k=t.height+'p';if(seen[k])return false;seen[k]=true;return t.height;})
                          .sort(function(a,b){return b.height-a.height;})
                          .map(function(t,i){return{index:i,label:t.height>=1080?'Full HD (1080p)':t.height>=720?'HD (720p)':t.height>=480?'SD (480p)':t.height+'p',active:t.active};});
                        window.ReactNativeWebView.postMessage('OVERLAY_QUALITIES:'+JSON.stringify(list));
                    }
                })();true;
            `);
        }
        setShowQualityModal(true);
    };

    const handleSelectQuality = (index: number | 'auto') => {
        setShowQualityModal(false);
        if (mode === 'shaka') {
            if (index === 'auto') {
                cmd("window.postMessage('CMD_SET_QUALITY_AUTO','*');true;");
            } else {
                cmd(`window.postMessage('CMD_SET_QUALITY:${index}','*');true;`);
            }
        } else if (mode === 'webview' && index !== 'auto') {
            cmd(`
                (function(){
                    if(window.player&&window.player.getVariantTracks){
                        var tr=window.player.getVariantTracks()
                            .filter(function(t){return t.height;})
                            .sort(function(a,b){return b.height-a.height;});
                        if(tr[${index}]){
                            window.player.configure({abr:{enabled:false}});
                            window.player.selectVariantTrack(tr[${index}],true,0);
                        }
                    }
                })();true;
            `);
        } else {
            onSelectQuality?.(index);
        }
    };

    const isLive = currentTime === 0 && duration === 0;
    const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
    const accent = accentColor;
    const accentDim = `${accent}20`;
    const accentBorder = `${accent}50`;

    // ─── Control Button ────────────────────────────────────────────────────
    const CtrlBtn = ({ icon: Icon, onPress, big = false, label = '' }: any) => (
        <TvFocusable
            onPress={() => { showAndResetTimer(); onPress(); }}
            onFocus={showAndResetTimer}
            scaleTo={big ? 1.15 : 1.2}
            borderWidth={0}
            style={[big ? styles.playBtn : styles.ctrlBtn, big && { borderColor: accentBorder }]}
            focusedStyle={big ? [styles.playBtnFocused, { borderColor: accent, backgroundColor: accentDim }] : styles.ctrlBtnFocused}
        >
            {(f: boolean) => (
                <View style={[big ? styles.playBtnInner : null]}>
                    <Icon color={f ? accent : '#fff'} size={big ? 46 : 30} fill={big && !isPaused ? (f ? accent : '#fff') : 'transparent'} />
                    {label ? <Text style={{ color: f ? accent : '#aaa', fontSize: 9, marginTop: 3, fontWeight: '700' }}>{label}</Text> : null}
                </View>
            )}
        </TvFocusable>
    );

    return (
        <>
            <Animated.View
                style={[StyleSheet.absoluteFillObject, styles.overlay, { opacity: controlsOpacity }]}
                pointerEvents={showControls ? 'box-none' : 'none'}
            >
                {/* ── TOP BAR: Título + Volver ─────────────────────────── */}
                <View style={styles.topBar}>
                    {onBack && (
                        <TvFocusable onPress={onBack} onFocus={showAndResetTimer} scaleTo={1.12} borderWidth={0}
                            style={styles.backBtn} focusedStyle={styles.backBtnFocused}>
                            {(f: boolean) => <ArrowLeft color={f ? accent : '#fff'} size={26} />}
                        </TvFocusable>
                    )}
                    <View style={styles.titleBlock}>
                        <Text numberOfLines={1} style={styles.titleText}>{title}</Text>
                        {isLive && (
                            <View style={[styles.liveBadge, { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                                <View style={styles.liveDot} />
                                <Text style={styles.liveText}>EN VIVO</Text>
                            </View>
                        )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        {showServerButton && servers.length > 1 && (
                            <TvFocusable onPress={() => { showAndResetTimer(); setShowServerModal(true); }} onFocus={showAndResetTimer}
                                scaleTo={1.1} borderWidth={0} style={styles.topBtn} focusedStyle={styles.topBtnFocused}>
                                {(f: boolean) => <Server color={f ? accent : '#ccc'} size={20} />}
                            </TvFocusable>
                        )}
                    </View>
                </View>

                {/* ── PROGRESS BAR ─────────────────────────────────────── */}
                {!isLive && (
                    <View style={styles.progressArea}>
                        <View style={styles.progressBg}>
                            <View style={[styles.progressFg, { width: `${progress}%`, backgroundColor: accent }]} />
                        </View>
                        <View style={styles.timeRow}>
                            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                            <Text style={styles.timeText}>{formatTime(duration)}</Text>
                        </View>
                    </View>
                )}

                {/* ── BOTTOM CONTROLS ──────────────────────────────────── */}
                <View style={styles.bottomBar}>
                    <CtrlBtn icon={SkipBack} onPress={() => handleSeek(-15)} label="-15s" />

                    {/* Botón Play — recibe foco TV cuando aparece el overlay */}
                    <TvFocusable
                        hasTVPreferredFocus={playBtnFocused}
                        onPress={() => { showAndResetTimer(); handlePlayPause(); }}
                        onFocus={() => { showAndResetTimer(); setPlayBtnFocused(false); }}
                        scaleTo={1.15}
                        borderWidth={0}
                        style={[styles.playBtn, { borderColor: accentBorder }]}
                        focusedStyle={[styles.playBtnFocused, { borderColor: accent, backgroundColor: accentDim }]}
                    >
                        {(f: boolean) => (
                            <View style={styles.playBtnInner}>
                                {isPaused
                                    ? <Play color={f ? accent : '#fff'} size={46} />
                                    : <Pause color={f ? accent : '#fff'} size={46} fill={f ? accent : '#fff'} />}
                            </View>
                        )}
                    </TvFocusable>

                    <CtrlBtn icon={SkipForward} onPress={() => handleSeek(15)} label="+15s" />
                    <View style={styles.rightBtns}>
                        <CtrlBtn icon={isMuted ? VolumeX : Volume2} onPress={handleMute} />
                        <CtrlBtn icon={Settings} onPress={handleOpenQuality} />
                    </View>
                </View>
            </Animated.View>

            {/* ── QUALITY MODAL ────────────────────────────────────────── */}
            <Modal visible={showQualityModal} transparent animationType="fade" onRequestClose={() => setShowQualityModal(false)}>
                <View style={styles.modalBg}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Calidad de Video</Text>
                            <TvFocusable onPress={() => setShowQualityModal(false)} scaleTo={1.15} borderWidth={0}
                                style={{ borderRadius: 20, padding: 6 }} focusedStyle={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                {(f: boolean) => <X color={f ? accent : '#aaa'} size={22} />}
                            </TvFocusable>
                        </View>

                        <TvFocusable onPress={() => handleSelectQuality('auto')} scaleTo={1.04} borderWidth={0}
                            hasTVPreferredFocus style={styles.qualityRow} focusedStyle={{ backgroundColor: 'transparent' }}>
                            {(f: boolean) => (
                                <View style={[styles.qualityInner, f && { backgroundColor: accent, borderColor: accent }]}>
                                    <Text style={[styles.qualityLabel, f && { color: '#000' }]}>⚡ Automático (ABR)</Text>
                                </View>
                            )}
                        </TvFocusable>

                        {qualityLevels.map((q) => (
                            <TvFocusable key={q.index} onPress={() => handleSelectQuality(q.index)} scaleTo={1.04} borderWidth={0}
                                style={styles.qualityRow} focusedStyle={{ backgroundColor: 'transparent' }}>
                                {(f: boolean) => (
                                    <View style={[
                                        styles.qualityInner,
                                        f && { backgroundColor: accent, borderColor: accent },
                                        q.active && !f && { borderColor: accent, borderWidth: 2 }
                                    ]}>
                                        <Text style={[styles.qualityLabel, f && { color: '#000' }]}>{q.label}</Text>
                                        {q.active && !f && <Check color={accent} size={18} />}
                                    </View>
                                )}
                            </TvFocusable>
                        ))}

                        {qualityLevels.length === 0 && (
                            <Text style={{ color: '#6B7280', textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
                                El reproductor no reportó calidades disponibles.
                            </Text>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── SERVER MODAL ─────────────────────────────────────────── */}
            <Modal visible={showServerModal} transparent animationType="fade" onRequestClose={() => setShowServerModal(false)}>
                <View style={styles.modalBg}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Seleccionar Servidor</Text>
                            <TvFocusable onPress={() => setShowServerModal(false)} scaleTo={1.15} borderWidth={0}
                                style={{ borderRadius: 20, padding: 6 }} focusedStyle={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                {(f: boolean) => <X color={f ? accent : '#aaa'} size={22} />}
                            </TvFocusable>
                        </View>

                        {servers.map((srv, i) => (
                            <TvFocusable key={i} onPress={() => { setShowServerModal(false); onSelectServer?.(i); }} scaleTo={1.04}
                                hasTVPreferredFocus={i === currentServerIndex}
                                borderWidth={0} style={styles.qualityRow} focusedStyle={{ backgroundColor: 'transparent' }}>
                                {(f: boolean) => (
                                    <View style={[
                                        styles.qualityInner,
                                        f && { backgroundColor: accent, borderColor: accent },
                                        i === currentServerIndex && !f && { borderColor: accent, borderWidth: 2 }
                                    ]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <Server color={f ? '#000' : accent} size={16} />
                                            <Text style={[styles.qualityLabel, f && { color: '#000' }]}>{srv.name}</Text>
                                        </View>
                                        {i === currentServerIndex && !f && <Check color={accent} size={18} />}
                                    </View>
                                )}
                            </TvFocusable>
                        ))}
                    </View>
                </View>
            </Modal>
        </>
    );
}

// ─── Handler de mensajes del WebView para actualizar el overlay ──────────────
/**
 * Procesá los mensajes del WebView y devuelve el estado actualizado
 * Llamar desde el `onMessage` del WebView de cada player
 */
export function handleOverlayMessage(
    msg: string,
    setters: {
        setCurrentTime: (t: number) => void;
        setDuration: (d: number) => void;
        setIsPaused: (p: boolean) => void;
        setQualityLevels: (q: QualityLevel[]) => void;
        setIsPlaying?: (v: boolean) => void;
    }
) {
    const { setCurrentTime, setDuration, setIsPaused, setQualityLevels, setIsPlaying } = setters;

    // Shaka / TvPlayerScreen formato
    if (msg.startsWith('timeupdate:')) {
        const parts = msg.replace('timeupdate:', '').split(',');
        const t = parseFloat(parts[0]);
        const d = parseFloat(parts[1]);
        if (!isNaN(t)) setCurrentTime(t);
        if (!isNaN(d) && d > 0) setDuration(d);
    }
    // TvDrmPlayerScreen formato
    else if (msg.startsWith('TIME:')) {
        const parts = msg.split(':');
        setCurrentTime(parseFloat(parts[1]) || 0);
        setDuration(parseFloat(parts[2]) || 0);
    }
    else if (msg === 'video_paused' || msg === 'VIDEO_PAUSED') setIsPaused(true);
    else if (msg === 'video_resumed' || msg === 'video_playing' || msg === 'VIDEO_PLAYING' || msg === 'VIDEO_RESUMED') {
        setIsPaused(false);
        setIsPlaying?.(true);
    }
    else if (msg.startsWith('qualities:')) {
        try { setQualityLevels(JSON.parse(msg.replace('qualities:', ''))); } catch (_) { }
    }
    else if (msg.startsWith('QUALITIES:')) {
        try { setQualityLevels(JSON.parse(msg.slice(10))); } catch (_) { }
    }
    else if (msg.startsWith('OVERLAY_QUALITIES:')) {
        try { setQualityLevels(JSON.parse(msg.slice(18))); } catch (_) { }
    }
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    overlay: {
        zIndex: 9999,
        justifyContent: 'space-between',
        paddingTop: 20,
        paddingBottom: 0,
    },

    // Top bar
    topBar: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 40, paddingTop: 10, paddingBottom: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        gap: 14,
    },
    backBtn: {
        borderRadius: 24, padding: 12,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    backBtnFocused: {
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 2, borderColor: '#FACC15',
    },
    titleBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    titleText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
    liveBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 6, borderWidth: 1,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
    liveText: { color: '#ef4444', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    topBtn: {
        borderRadius: 20, padding: 10,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    topBtnFocused: {
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 2, borderColor: '#FACC15',
    },

    // Progress
    progressArea: {
        paddingHorizontal: 56,
        backgroundColor: 'rgba(0,0,0,0.35)',
        paddingBottom: 6,
    },
    progressBg: {
        width: '100%', height: 5,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 3, overflow: 'hidden',
    },
    progressFg: { height: '100%', borderRadius: 3 },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    timeText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },

    // Bottom
    bottomBar: {
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        gap: 24, paddingHorizontal: 60, paddingVertical: 24,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    rightBtns: { flexDirection: 'row', gap: 14, marginLeft: 20 },

    // Buttons
    ctrlBtn: {
        borderRadius: 36, padding: 14,
        backgroundColor: BTN_BG,
    },
    ctrlBtnFocused: {
        backgroundColor: BTN_FOCUSED,
        borderWidth: 2, borderColor: '#FACC15',
    },
    playBtn: {
        borderRadius: 60, padding: 20,
        backgroundColor: ACCENT_DIM,
        borderWidth: 3, borderColor: ACCENT_BORDER,
    },
    playBtnFocused: {
        borderWidth: 3,
    },
    playBtnInner: { alignItems: 'center', justifyContent: 'center' },

    // Modal
    modalBg: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
        alignItems: 'center', justifyContent: 'center',
    },
    modalCard: {
        width: 400, backgroundColor: '#0f0f14',
        borderRadius: 22, padding: 28,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        elevation: 24,
    },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 20,
    },
    modalTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
    qualityRow: { borderRadius: 12, marginBottom: 8 },
    qualityInner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
        backgroundColor: '#18181b', borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    qualityLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
