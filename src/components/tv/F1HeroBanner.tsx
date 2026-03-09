/**
 * F1HeroBanner — Banner prominente de telemetría F1
 * Para la pantalla de Deportes: card horizontal visible y fácil de navegar con control de TV
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import TvFocusable from './TvFocusable';
import { Zap, Radio, Map, Timer } from 'lucide-react-native';

// ─── Paleta F1 ─────────────────────────────────────────────────────────────────
const F1_RED = '#e10600';
const GOLD = '#FFD700';
const BG = '#070a0d';
const TEXT = '#FFFFFF';
const TEXT_DIM = '#8B949E';

// ─── Trazado simplificado de un circuito genérico tipo F1 ─────────────────────
// Se usa solo como decoración visual — el real está en la pantalla completa
const DECORATIVE_CIRCUIT = [
    [30, 90], [50, 60], [80, 40], [130, 35], [170, 48], [195, 65],
    [200, 90], [190, 115], [165, 128], [135, 132], [110, 125], [90, 135],
    [75, 148], [60, 145], [45, 130], [32, 112], [30, 90],
];

// ─── Dots de pilotos decorativos ──────────────────────────────────────────────
const DECO_DRIVERS = [
    { cx: 130, cy: 35, color: '#3671C6', pos: 1 },  // Red Bull
    { cx: 195, cy: 65, color: '#E8002D', pos: 2 },  // Ferrari
    { cx: 165, cy: 128, color: '#FF8000', pos: 3 }, // McLaren
    { cx: 60, cy: 145, color: '#27F4D2', pos: 4 },  // Mercedes
];

// ─── Pill "EN VIVO" / "PRÓXIMAMENTE" ─────────────────────────────────────────
function LivePill({ isLive }: { isLive?: boolean }) {
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!isLive) return;
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [isLive]);

    if (isLive) {
        return (
            <View style={styles.livePill}>
                <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
                <Text style={styles.liveText}>EN VIVO</Text>
            </View>
        );
    }
    return (
        <View style={[styles.livePill, { backgroundColor: 'rgba(255,215,0,0.12)', borderColor: 'rgba(255,215,0,0.4)' }]}>
            <Text style={[styles.liveText, { color: GOLD }]}>PRÓXIMAMENTE</Text>
        </View>
    );
}

// ─── Componente principal ──────────────────────────────────────────────────────
interface F1HeroBannerProps {
    onPress: () => void;
    isLive?: boolean;
    sessionName?: string;   // "Gran Premio de Australia · Carrera · V.34/58"
    circuitName?: string;
}

export default function F1HeroBanner({
    onPress,
    isLive = false,
    sessionName,
    circuitName = 'Melbourne Grand Prix Circuit',
}: F1HeroBannerProps) {
    const pathStr = DECORATIVE_CIRCUIT.map(([x, y]) => `${x},${y}`).join(' ');

    return (
        <TvFocusable
            onPress={onPress}
            scaleTo={1.02}
            borderWidth={0}
            style={styles.card}
            focusedStyle={styles.cardFocused}
        >
            {(focused: boolean) => (
                <View style={styles.inner}>
                    {/* ── Glow de fondo (solo en focus) ─────────────── */}
                    {focused && <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                        <View style={styles.focusGlow} />
                    </View>}

                    {/* ── Barra izquierda roja ──────────────────────── */}
                    <View style={styles.leftBar} />

                    {/* ── COLUMNA IZQUIERDA: Branding ───────────────── */}
                    <View style={styles.colLeft}>
                        <Text style={[styles.f1Title, focused && { color: '#fff' }]}>
                            FÓRMULA <Text style={{ color: F1_RED }}>1</Text>
                        </Text>
                        <Text style={styles.subTitle}>TELEMETRÍA EN TIEMPO REAL</Text>

                        <LivePill isLive={isLive} />

                        {sessionName ? (
                            <Text numberOfLines={1} style={styles.sessionName}>{sessionName}</Text>
                        ) : null}

                        <View style={styles.featRow}>
                            {[
                                { icon: Timer, label: 'Tiempos' },
                                { icon: Map, label: 'Mapa' },
                                { icon: Radio, label: 'Radio' },
                            ].map(({ icon: Icon, label }) => (
                                <View key={label} style={styles.featItem}>
                                    <Icon color={focused ? GOLD : TEXT_DIM} size={11} />
                                    <Text style={[styles.featText, focused && { color: GOLD }]}>{label}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* ── COLUMNA CENTRO: Circuito decorativo ───────── */}
                    <View style={styles.colCenter}>
                        <Svg width={232} height={185} viewBox="0 0 232 185">
                            {/* Glow del circuito */}
                            <Polyline
                                points={pathStr}
                                stroke={focused ? `${F1_RED}55` : 'rgba(255,255,255,0.08)'}
                                strokeWidth="8"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            {/* Línea del circuito */}
                            <Polyline
                                points={pathStr}
                                stroke={focused ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)'}
                                strokeWidth="2.5"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            {/* Drivers */}
                            {DECO_DRIVERS.map(d => (
                                <React.Fragment key={d.pos}>
                                    <Circle cx={d.cx} cy={d.cy} r={7} fill={d.color} opacity={0.9} />
                                    <Circle cx={d.cx} cy={d.cy} r={4} fill="#fff" opacity={0.5} />
                                </React.Fragment>
                            ))}
                        </Svg>
                        <Text style={[styles.circuitName, focused && { color: TEXT_DIM }]}>
                            {circuitName}
                        </Text>
                    </View>

                    {/* ── COLUMNA DERECHA: CTA ──────────────────────── */}
                    <View style={styles.colRight}>
                        <View style={[styles.ctaBtn, focused && styles.ctaBtnFocused]}>
                            <Zap color={focused ? '#fff' : F1_RED} size={22} fill={focused ? '#fff' : F1_RED} />
                            <Text style={[styles.ctaText, focused && { color: '#fff' }]}>
                                VER TELEMETRÍA
                            </Text>
                        </View>
                        <Text style={styles.ctaSub}>
                            Datos en tiempo real{'\n'}api.multiviewer.app
                        </Text>
                    </View>
                </View>
            )}
        </TvFocusable>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    card: {
        marginHorizontal: 64,
        marginBottom: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: `${F1_RED}30`,
        backgroundColor: BG,
        overflow: 'hidden',
    },
    cardFocused: {
        borderColor: F1_RED,
        shadowColor: F1_RED,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 24,
        elevation: 20,
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 155,
    },

    // Focus glow overlay
    focusGlow: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: `${F1_RED}08`,
        borderRadius: 16,
    },

    // Red left stripe
    leftBar: {
        width: 4,
        height: '100%',
        backgroundColor: F1_RED,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },

    // Columns
    colLeft: {
        flex: 0.38,
        paddingHorizontal: 22,
        paddingVertical: 18,
        gap: 6,
    },
    colCenter: {
        flex: 0.30,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    colRight: {
        flex: 0.32,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 22,
    },

    // Left col
    f1Title: {
        color: `${F1_RED}cc`,
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: 1,
        fontStyle: 'italic',
    },
    subTitle: {
        color: GOLD,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 2,
        opacity: 0.85,
    },
    livePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        backgroundColor: `${F1_RED}18`,
        borderWidth: 1,
        borderColor: `${F1_RED}50`,
        borderRadius: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginTop: 2,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: F1_RED },
    liveText: { color: F1_RED, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    sessionName: {
        color: TEXT_DIM, fontSize: 10, fontWeight: '600', marginTop: 2,
    },
    featRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    featItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    featText: { color: TEXT_DIM, fontSize: 9, fontWeight: '700' },

    // Center col
    circuitName: { color: 'rgba(255,255,255,0.25)', fontSize: 9, marginTop: 4, textAlign: 'center' },

    // Right col
    ctaBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        backgroundColor: `${F1_RED}18`,
        borderWidth: 1.5,
        borderColor: F1_RED,
        borderRadius: 10,
        paddingHorizontal: 20,
        paddingVertical: 13,
    },
    ctaBtnFocused: {
        backgroundColor: F1_RED,
        borderColor: F1_RED,
    },
    ctaText: {
        color: F1_RED,
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    ctaSub: {
        color: TEXT_DIM,
        fontSize: 9,
        textAlign: 'center',
        lineHeight: 14,
        opacity: 0.7,
    },
});
