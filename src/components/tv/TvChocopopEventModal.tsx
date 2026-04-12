/**
 * TvChocopopEventModal.tsx
 * Modal de detalle de un evento deportivo de ChocoPop Flow.
 *
 * Diseño fiel al sitio chocopopflow.com (ver screenshot del usuario):
 *  - Backdrop full-width en la parte superior (~50% de alto)
 *  - Logos de equipos grandes superpuestos sobre el degradado del backdrop
 *  - Título completo del partido
 *  - Metadata: año, "Evento en vivo", género
 *  - Descripción del partido
 *  - Countdown regresivo "Comienza en: Xh Xm Xs" (solo si soon)
 *  - Botón principal: "VER EN VIVO" → navega al reproductor
 *  - Sección de géneros (GÉNEROS / DIRECTOR / REPARTO) como en el sitio
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, Image, Modal, StyleSheet,
    Dimensions, TouchableOpacity, ScrollView, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Play, X, Clock } from 'lucide-react-native';
import TvFocusable from './TvFocusable';
import { ChocopopEvent } from '../../store/useAppStore';

const { width: W, height: H } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcCountdown(eventDateUTC: string): string {
    const diffMs = new Date(eventDateUTC).getTime() - Date.now();
    if (diffMs <= 0) return 'Comenzando...';
    const totalSecs = Math.floor(diffMs / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
    event: ChocopopEvent | null;
    visible: boolean;
    onClose: () => void;
}

export default function TvChocopopEventModal({ event, visible, onClose }: Props) {
    const navigation = useNavigation<any>();
    const isLive = event?.status === 'live';
    const [countdown, setCountdown] = useState(() => event ? calcCountdown(event.eventDate) : '');

    // Countdown live
    useEffect(() => {
        if (!event || isLive) return;
        setCountdown(calcCountdown(event.eventDate));
        const timer = setInterval(() => setCountdown(calcCountdown(event.eventDate)), 1000);
        return () => clearInterval(timer);
    }, [event, isLive]);

    // Pulso animado para badge EN VIVO
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (!isLive) return;
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.2, duration: 700, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [isLive]);

    if (!event) return null;

    const handleWatch = () => {
        onClose();
        navigation.navigate('SportsPlayerTV', {
            item: {
                id: event.id,
                title: event.title,
                type: 'tv',
                videoUrl: event.videoUrl,
                servers: [{ name: 'Servidor 1', url: event.videoUrl }],
                poster: event.backdrop || '',
                backdrop: event.backdrop || '',
                description: event.description,
                genre: 'Deportes',
                year: event.year,
                rating: '',
            },
        });
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* ── Backdrop superior ── */}
                    <View style={styles.backdropContainer}>
                        {event.backdrop ? (
                            <Image
                                source={{ uri: event.backdrop }}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0a1428' }]} />
                        )}

                        {/* Overlay degradado — como el hex pattern del sitio */}
                        <View style={styles.backdropGradient} />

                        {/* Logos de equipos superpuestos sobre el degradado */}
                        <View style={styles.logosContainer}>
                            <View style={styles.logoWrapper}>
                                {event.logo1 ? (
                                    <Image source={{ uri: event.logo1 }} style={styles.logo} resizeMode="contain" />
                                ) : (
                                    <View style={styles.logoEmpty} />
                                )}
                            </View>
                            <View style={styles.logoWrapper}>
                                {event.logo2 ? (
                                    <Image source={{ uri: event.logo2 }} style={styles.logo} resizeMode="contain" />
                                ) : (
                                    <View style={styles.logoEmpty} />
                                )}
                            </View>
                        </View>

                        {/* Botón cerrar */}
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <X color="#fff" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* ── Contenido inferior ── */}
                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {/* Título */}
                        <Text style={styles.title} numberOfLines={2}>
                            {event.title}
                        </Text>

                        {/* Metadata chips — igual que el sitio */}
                        <View style={styles.metaRow}>
                            <View style={styles.yearChip}>
                                <Text style={styles.yearText}>{event.year}</Text>
                            </View>
                            <Text style={styles.metaDot}>Evento en vivo</Text>
                            <Text style={styles.metaDot}>evento</Text>
                        </View>

                        {/* Descripción */}
                        {!!event.description && (
                            <Text style={styles.description} numberOfLines={3}>
                                {event.description}
                            </Text>
                        )}

                        {/* Countdown "Comienza en" — solo si soon (fiel al diseño del sitio) */}
                        {!isLive && (
                            <View style={styles.countdownRow}>
                                <Clock color="#f59e0b" size={14} strokeWidth={2.5} />
                                <Text style={styles.countdownLabel}>Comienza en: </Text>
                                <Text style={styles.countdownValue}>{countdown}</Text>
                            </View>
                        )}

                        {/* Badge EN VIVO */}
                        {isLive && (
                            <View style={styles.liveRow}>
                                <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
                                <Text style={styles.liveText}>• EN TRANSMISIÓN AHORA · {event.timeAR} AR</Text>
                            </View>
                        )}

                        {/* Botón VER EN VIVO — igual al "Ver grabación" del sitio */}
                        <TvFocusable
                            onPress={handleWatch}
                            borderWidth={0}
                            scaleTo={1.04}
                            style={{ borderRadius: 8, marginTop: 20, marginBottom: 28, alignSelf: 'flex-start' }}
                            hasTVPreferredFocus={true}
                        >
                            {(focused: boolean) => (
                                <View style={[styles.watchBtn, focused && styles.watchBtnFocused]}>
                                    <Play
                                        color={focused ? '#000' : '#fff'}
                                        size={16}
                                        fill={focused ? '#000' : '#fff'}
                                    />
                                    <Text style={[styles.watchBtnText, focused && { color: '#000' }]}>
                                        {isLive ? 'VER EN VIVO' : 'VER TRANSMISIÓN'}
                                    </Text>
                                </View>
                            )}
                        </TvFocusable>

                        {/* Sección de metadata inferior — igual al sitio */}
                        <View style={styles.separator} />
                        <View style={styles.detailsGrid}>
                            <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>GÉNEROS</Text>
                                <Text style={styles.detailValue}>Evento</Text>
                            </View>
                            <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>DIRECTOR</Text>
                                <Text style={styles.detailValue}>—</Text>
                            </View>
                            <View style={styles.detailCol}>
                                <Text style={styles.detailLabel}>REPARTO</Text>
                                <Text style={styles.detailValue}>—</Text>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const MODAL_W = Math.min(W * 0.65, 820);
const BACKDROP_H = 260;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.88)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        width: MODAL_W,
        maxHeight: H * 0.88,
        backgroundColor: '#0d1117',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        elevation: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 24,
    },
    // ── Backdrop ──
    backdropContainer: {
        width: '100%',
        height: BACKDROP_H,
        overflow: 'hidden',
    },
    backdropGradient: {
        ...StyleSheet.absoluteFillObject,
        // Degradado manual (de oscuro abajo hacia transparente arriba)
        backgroundColor: 'transparent',
        // Fake degradado con varias capas
    },
    logosContainer: {
        position: 'absolute',
        bottom: 24,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 40,
        alignItems: 'flex-end',
    },
    logoWrapper: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
        elevation: 8,
    },
    logo: {
        width: 96,
        height: 96,
    },
    logoEmpty: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    closeBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    // ── Contenido ──
    content: {
        paddingHorizontal: 32,
        paddingTop: 24,
    },
    title: {
        color: '#ffffff',
        fontSize: 26,
        fontWeight: '900',
        letterSpacing: -0.5,
        lineHeight: 32,
        marginBottom: 10,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    yearChip: {
        backgroundColor: 'rgba(245,158,11,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.3)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    yearText: {
        color: '#f59e0b',
        fontSize: 11,
        fontWeight: '800',
    },
    metaDot: {
        color: '#6b7280',
        fontSize: 12,
        fontWeight: '600',
    },
    description: {
        color: '#9ca3af',
        fontSize: 13,
        lineHeight: 20,
        fontWeight: '500',
        marginBottom: 14,
    },
    // ── Countdown ──
    countdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    countdownLabel: {
        color: '#f59e0b',
        fontSize: 13,
        fontWeight: '700',
    },
    countdownValue: {
        color: '#f59e0b',
        fontSize: 13,
        fontWeight: '900',
    },
    // ── EN VIVO ──
    liveRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
    liveText: {
        color: '#ef4444',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    // ── Botón ver ──
    watchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#1e293b',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 8,
    },
    watchBtnFocused: {
        backgroundColor: '#ffffff',
        borderColor: '#ffffff',
    },
    watchBtnText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    // ── Grid detalles ──
    separator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom: 20,
    },
    detailsGrid: {
        flexDirection: 'row',
        gap: 40,
        paddingBottom: 32,
    },
    detailCol: {
        flex: 1,
    },
    detailLabel: {
        color: '#4b5563',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    detailValue: {
        color: '#e5e7eb',
        fontSize: 14,
        fontWeight: '700',
    },
});
