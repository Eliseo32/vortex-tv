/**
 * TvChocopopEventCard.tsx
 * Card de evento deportivo al estilo chocopopflow.com para Android TV.
 *
 * Diseño:
 *  - Fondo: backdrop image con overlay gradiente oscuro
 *  - Logos de equipos superpuestos sobre la imagen
 *  - Badge animado: "EN VIVO" (rojo pulsante) o "PRÓXIMAMENTE" (dorado)
 *  - Countdown regresivo en tiempo real (solo cuando status="soon")
 *  - Al focus: borde coloreado, escala 1.06, aparece botón ▶
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import TvFocusable from './TvFocusable';
import { Play } from 'lucide-react-native';
import { ChocopopEvent } from '../../store/useAppStore';

// ─── Helpers de tiempo ────────────────────────────────────────────────────────
function calcCountdown(eventDateUTC: string): string {
    const now = Date.now();
    const target = new Date(eventDateUTC).getTime();
    const diffMs = target - now;
    if (diffMs <= 0) return 'Comenzando...';
    const totalSecs = Math.floor(diffMs / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
}

// ─── Componente ───────────────────────────────────────────────────────────────
interface Props {
    event: ChocopopEvent;
    onPress: () => void;
}

export default function TvChocopopEventCard({ event, onPress }: Props) {
    const isLive = event.status === 'live';
    const [countdown, setCountdown] = useState(() => calcCountdown(event.eventDate));

    // Countdown live (cada segundo, solo si soon)
    useEffect(() => {
        if (isLive) return;
        const timer = setInterval(() => setCountdown(calcCountdown(event.eventDate)), 1000);
        return () => clearInterval(timer);
    }, [event.eventDate, isLive]);

    // Pulso animado para badge EN VIVO
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (!isLive) return;
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [isLive]);

    return (
        <TvFocusable
            onPress={onPress}
            borderWidth={0}
            scaleTo={1.06}
            style={{ borderRadius: 14, marginRight: 20 }}
            focusedStyle={{ backgroundColor: 'transparent' }}
        >
            {(focused: boolean) => (
                <View style={[
                    styles.card,
                    focused && {
                        borderColor: isLive ? '#ef4444' : '#f59e0b',
                        shadowColor: isLive ? '#ef4444' : '#f59e0b',
                        shadowOpacity: 0.5,
                        shadowRadius: 16,
                        elevation: 12,
                    },
                ]}>
                    {/* ── Sección imagen (backdrop + logos) ── */}
                    <View style={styles.imageContainer}>
                        {/* Backdrop */}
                        {event.backdrop ? (
                            <Image
                                source={{ uri: event.backdrop }}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0d1a2e' }]} />
                        )}

                        {/* Overlay degradado oscuro */}
                        <View style={styles.backdropOverlay} />

                        {/* Logos de equipos */}
                        <View style={styles.logosRow}>
                            {event.logo1 ? (
                                <Image source={{ uri: event.logo1 }} style={styles.logo} resizeMode="contain" />
                            ) : (
                                <View style={styles.logoPlaceholder} />
                            )}
                            <Text style={styles.vsText}>VS</Text>
                            {event.logo2 ? (
                                <Image source={{ uri: event.logo2 }} style={styles.logo} resizeMode="contain" />
                            ) : (
                                <View style={styles.logoPlaceholder} />
                            )}
                        </View>

                        {/* Botón play (solo al focus) */}
                        {focused && (
                            <View style={styles.playOverlay}>
                                <View style={styles.playButton}>
                                    <Play color="#fff" size={22} fill="#fff" />
                                </View>
                            </View>
                        )}
                    </View>

                    {/* ── Sección info ── */}
                    <View style={[styles.info, focused && { backgroundColor: 'rgba(20,24,40,0.98)' }]}>
                        {/* Badge de estado */}
                        {isLive ? (
                            <View style={styles.badgeLive}>
                                <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
                                <Text style={styles.badgeLiveText}>EN VIVO</Text>
                            </View>
                        ) : (
                            <View style={styles.badgeSoon}>
                                <Text style={styles.badgeSoonText}>PRÓXIMAMENTE</Text>
                            </View>
                        )}

                        {/* Título del partido */}
                        <Text numberOfLines={1} style={[styles.matchTitle, focused && { color: '#fff' }]}>
                            {event.team1} vs {event.team2}
                        </Text>

                        {/* Liga + año */}
                        <View style={styles.metaRow}>
                            <Text numberOfLines={1} style={styles.league}>
                                {event.league || 'Evento'}
                            </Text>
                            <View style={styles.yearChip}>
                                <Text style={styles.yearText}>{event.year}</Text>
                            </View>
                        </View>

                        {/* Countdown (solo si soon) */}
                        {!isLive && (
                            <Text style={styles.countdown}>⏱ {countdown}</Text>
                        )}

                        {/* Hora Argentina */}
                        {isLive && (
                            <Text style={[styles.countdown, { color: '#ef4444' }]}>🔴 En transmisión · {event.timeAR} AR</Text>
                        )}
                    </View>
                </View>
            )}
        </TvFocusable>
    );
}

const styles = StyleSheet.create({
    card: {
        width: 280,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#0d1628',
        borderWidth: 2,
        borderColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
    },
    imageContainer: {
        width: '100%',
        height: 150,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backdropOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(5, 10, 30, 0.55)',
    },
    logosRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        zIndex: 2,
    },
    logo: {
        width: 68,
        height: 68,
    },
    logoPlaceholder: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    vsText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
    },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
        zIndex: 3,
    },
    playButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    info: {
        padding: 14,
        paddingTop: 12,
        backgroundColor: 'rgba(13, 22, 40, 0.97)',
    },
    badgeLive: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderWidth: 1,
        borderColor: '#ef4444',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginBottom: 8,
        gap: 5,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#ef4444',
    },
    badgeLiveText: {
        color: '#ef4444',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    badgeSoon: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(245,158,11,0.12)',
        borderWidth: 1,
        borderColor: '#f59e0b',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginBottom: 8,
    },
    badgeSoonText: {
        color: '#f59e0b',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.8,
    },
    matchTitle: {
        color: '#e8e8f0',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.2,
        marginBottom: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    league: {
        color: '#6b7280',
        fontSize: 10,
        fontWeight: '700',
        flex: 1,
    },
    yearChip: {
        backgroundColor: 'rgba(245,158,11,0.15)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    yearText: {
        color: '#f59e0b',
        fontSize: 9,
        fontWeight: '800',
    },
    countdown: {
        color: '#f59e0b',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
});
