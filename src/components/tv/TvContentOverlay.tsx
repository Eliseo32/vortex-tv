/**
 * TvContentOverlay — Overlay simple para películas y series (WebView)
 *
 * - Aparece al inicio y cuando forceShowTrigger cambia
 * - Se oculta automáticamente en 4s
 * - Controla el video vía injectJavaScript (play/pause/seek)
 * - Muestra barra de progreso si hay duración disponible
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { ArrowLeft, Play, Pause, SkipBack, SkipForward } from 'lucide-react-native';
import TvFocusable from './TvFocusable';
import type { WebView } from 'react-native-webview';

const ACCENT = '#B026FF';
const AUTO_HIDE_MS = 4500;

const formatTime = (s: number) => {
    if (!s || isNaN(s) || s <= 0) return '--:--';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

interface TvContentOverlayProps {
    webViewRef: React.RefObject<WebView | null>;
    title?: string;
    /** Incrementar para forzar mostrar el overlay (desde cmd_open_controls) */
    forceShowTrigger?: number;
    currentTime?: number;
    duration?: number;
    isPaused?: boolean;
    onBack?: () => void;
}

export default function TvContentOverlay({
    webViewRef,
    title = '',
    forceShowTrigger = 0,
    currentTime = 0,
    duration = 0,
    isPaused = false,
    onBack,
}: TvContentOverlayProps) {
    const [visible, setVisible] = useState(true);
    const opacity = useRef(new Animated.Value(1)).current;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Inyectar JS en el WebView
    const inject = useCallback((js: string) => {
        try { webViewRef.current?.injectJavaScript(js + '; true;'); } catch (_) { }
    }, [webViewRef]);

    // Mostrar overlay y programar auto-hide
    const show = useCallback(() => {
        setVisible(true);
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => setVisible(false));
        }, AUTO_HIDE_MS);
    }, [opacity]);

    // Mostrar cuando forceShowTrigger cambia
    useEffect(() => {
        if (forceShowTrigger > 0) show();
    }, [forceShowTrigger]);

    // Mostrar al montar
    useEffect(() => {
        show();
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, []);

    const handlePlayPause = () => {
        show();
        inject(`(function(){
            var v = document.querySelector('video');
            if (v) { if (v.paused) v.play(); else v.pause(); }
            // JW Player
            try { if (window.jwplayer) { var jw=window.jwplayer(); if(jw.getState()==='PLAYING') jw.pause(); else jw.play(); } } catch(e){}
            // Clappr
            try { ['player','clappr','cp','p'].forEach(function(n){ var p=window[n]; if(p&&typeof p.pause==='function'){ if(p.isPlaying&&p.isPlaying()) p.pause(); else p.play(); } }); } catch(e){}
        })();`);
    };

    const handleSeek = (delta: number) => {
        show();
        inject(`(function(){
            var v = document.querySelector('video');
            if (v) v.currentTime += ${delta};
        })();`);
    };

    const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

    if (!visible) return null;

    return (
        <Animated.View style={[styles.container, { opacity }]} pointerEvents="box-none">

            {/* ── TOP BAR: back + title ─────────────────────────── */}
            <View style={styles.topBar} pointerEvents="box-none">
                <TvFocusable onPress={onBack} borderWidth={0} scaleTo={1.1} style={{ borderRadius: 50 }}>
                    {(f: boolean) => (
                        <View style={[styles.iconBtn, f && styles.iconBtnFocused]}>
                            <ArrowLeft color={f ? '#000' : '#fff'} size={22} />
                        </View>
                    )}
                </TvFocusable>
                {!!title && (
                    <Text numberOfLines={1} style={styles.title}>{title}</Text>
                )}
            </View>

            {/* ── BOTTOM BAR: progress + controls ──────────────── */}
            <View style={styles.bottomBar} pointerEvents="box-none">

                {/* Barra de progreso */}
                {duration > 0 && (
                    <View style={styles.progressRow}>
                        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                        </View>
                        <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>
                )}

                {/* Controles */}
                <View style={styles.controls}>
                    <TvFocusable onPress={() => handleSeek(-15)} borderWidth={0} scaleTo={1.12} style={{ borderRadius: 12 }}>
                        {(f: boolean) => (
                            <View style={[styles.ctrlBtn, f && styles.ctrlBtnFocused]}>
                                <SkipBack color={f ? '#000' : '#fff'} size={24} />
                                <Text style={[styles.ctrlLabel, f && { color: '#000' }]}>-15s</Text>
                            </View>
                        )}
                    </TvFocusable>

                    <TvFocusable hasTVPreferredFocus onPress={handlePlayPause} borderWidth={0} scaleTo={1.15} style={{ borderRadius: 50 }}>
                        {(f: boolean) => (
                            <View style={[styles.playBtn, f && styles.playBtnFocused]}>
                                {isPaused
                                    ? <Play color={f ? ACCENT : '#fff'} size={36} />
                                    : <Pause color={f ? ACCENT : '#fff'} size={36} fill={f ? ACCENT : '#fff'} />}
                            </View>
                        )}
                    </TvFocusable>

                    <TvFocusable onPress={() => handleSeek(15)} borderWidth={0} scaleTo={1.12} style={{ borderRadius: 12 }}>
                        {(f: boolean) => (
                            <View style={[styles.ctrlBtn, f && styles.ctrlBtnFocused]}>
                                <SkipForward color={f ? '#000' : '#fff'} size={24} />
                                <Text style={[styles.ctrlLabel, f && { color: '#000' }]}>+15s</Text>
                            </View>
                        )}
                    </TvFocusable>
                </View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
        zIndex: 100,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 20,
        paddingHorizontal: 28,
        paddingBottom: 40,
        gap: 16,
        // Gradiente de oscurecimiento superior (aplicado via textShadow en los hijos)
        backgroundColor: 'transparent',
    },
    iconBtn: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    },
    iconBtnFocused: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    title: {
        color: '#fff', fontSize: 20, fontWeight: '800', flex: 1,
        textShadowColor: 'rgba(0,0,0,0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
    bottomBar: {
        paddingBottom: 28,
        paddingHorizontal: 40,
        gap: 14,
        // Gradiente inferior
        backgroundColor: 'transparent',
    },
    progressRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    timeText: {
        color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', minWidth: 50, textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
    },
    progressTrack: {
        flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2, overflow: 'hidden',
    },
    progressFill: {
        height: '100%', backgroundColor: ACCENT, borderRadius: 2,
    },
    controls: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20,
    },
    ctrlBtn: {
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        width: 76, height: 58, borderRadius: 12, gap: 3,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    },
    ctrlBtnFocused: {
        backgroundColor: '#fff',
    },
    ctrlLabel: {
        color: '#fff', fontSize: 11, fontWeight: '800',
    },
    playBtn: {
        width: 82, height: 82, borderRadius: 41,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderWidth: 2, borderColor: 'rgba(176,38,255,0.5)',
        alignItems: 'center', justifyContent: 'center',
    },
    playBtnFocused: {
        backgroundColor: 'rgba(176,38,255,0.2)',
        borderColor: ACCENT,
    },
});
