import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import Svg, { Polygon, Polyline, Circle, Line } from 'react-native-svg';
import TvFocusable from './TvFocusable';
import { Zap, Radio, Map, Timer, Activity } from 'lucide-react-native';

const F1_RED = '#E10600';
const BG_DARK = '#050505';
const GLASS = 'rgba(20,20,20,0.85)';

// ─── Trazado simplificado del circuito
const CIRCUIT = [
    [20, 70], [40, 40], [80, 20], [130, 25], [170, 35], [200, 50],
    [210, 80], [190, 100], [160, 110], [110, 115], [80, 130],
    [50, 120], [30, 95], [20, 70]
];

function LivePulse() {
    const pulse = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ])).start();
    }, []);
    return <Animated.View style={[styles.pulseDot, { opacity: pulse }]} />;
}

export default function F1HeroBanner({
    onPress,
    isLive = true,
}: { onPress: () => void; isLive?: boolean }) {
    const pathStr = CIRCUIT.map(([x, y]) => `${x},${y}`).join(' ');

    return (
        <TvFocusable
            onPress={onPress}
            scaleTo={1.03}
            borderWidth={0}
            style={styles.card}
            focusedStyle={styles.cardFocused}
        >
            {(focused) => (
                <View style={[styles.inner, focused && styles.innerFocused]}>
                    <View style={styles.contentRow}>
                        
                        {/* ── IZQUIERDA: Marca y Estado ── */}
                        <View style={styles.brandCol}>
                            <View style={styles.badgeRow}>
                                {isLive ? (
                                    <View style={styles.liveBadge}>
                                        <LivePulse />
                                        <Text style={styles.liveText}>DATA EN VIVO</Text>
                                    </View>
                                ) : (
                                    <View style={styles.standbyBadge}>
                                        <Activity color="#a0a0a0" size={12} />
                                        <Text style={styles.standbyText}>STANDBY</Text>
                                    </View>
                                )}
                                <Text style={styles.f1Brand}>F1</Text>
                            </View>
                            
                            <Text style={[styles.title, focused && styles.textGlow]}>
                                TELEMETRÍA
                            </Text>

                            <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                    <Timer color={F1_RED} size={14} />
                                    <Text style={styles.metaVal}>L45/58</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Activity color={F1_RED} size={14} />
                                    <Text style={styles.metaVal}>GEAR 8</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Zap color={F1_RED} size={14} />
                                    <Text style={styles.metaVal}>324<Text style={styles.metaUnit}>km/h</Text></Text>
                                </View>
                            </View>
                        </View>

                        {/* ── CENTRO: Gráfico Radar ── */}
                        <View style={styles.radarCol}>
                            <Svg width="100%" height={150} viewBox="-20 0 250 150">
                                {/* Decoraciones digitales radiales */}
                                <Line x1="120" y1="0" x2="120" y2="150" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                                <Line x1="0" y1="75" x2="250" y2="75" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                                
                                <Polyline
                                    points={pathStr}
                                    stroke={focused ? F1_RED : 'rgba(255,255,255,0.2)'}
                                    strokeWidth={focused ? "4" : "2"}
                                    fill="none"
                                />
                                {focused && (
                                    <Polyline
                                        points={pathStr}
                                        stroke={F1_RED}
                                        strokeWidth="12"
                                        strokeOpacity="0.2"
                                        fill="none"
                                    />
                                )}
                                {/* Pilotos simulados */}
                                <Circle cx="170" cy="35" r="5" fill="#3671C6" />
                                <Circle cx="210" cy="80" r="5" fill={F1_RED} />
                                <Circle cx="110" cy="115" r="5" fill="#FF8000" />
                            </Svg>
                        </View>

                        {/* ── DERECHA: Acción ── */}
                        <View style={styles.actionCol}>
                            <View style={[styles.ctaBox, focused && styles.ctaBoxActive]}>
                                <Text style={[styles.ctaTitle, focused && { color: '#000' }]}>
                                    ACCEDER
                                </Text>
                                <View style={[styles.ctaSubRow, focused && { borderColor: 'rgba(0,0,0,0.1)' }]}>
                                    <Text style={[styles.ctaDesc, focused && { color: 'rgba(0,0,0,0.7)' }]}>Multiviewer Data</Text>
                                </View>
                            </View>
                        </View>

                    </View>
                    
                    {/* Elementos geométricos decorativos tipo HUD */}
                    <View style={styles.hudCornerTopLeft} />
                    <View style={styles.hudCornerBottomRight} />
                </View>
            )}
        </TvFocusable>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: 56,
        height: 160,
        backgroundColor: BG_DARK,
        borderRadius: 4, // Bordes más duros tipo pantalla industrial
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    cardFocused: {
        borderColor: F1_RED,
        shadowColor: F1_RED,
        shadowOpacity: 0.6,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 0 },
        elevation: 20,
        transform: [{ scale: 1.03 }],
    },
    inner: {
        flex: 1,
        backgroundColor: GLASS,
        padding: 24,
        justifyContent: 'center',
    },
    innerFocused: {
        backgroundColor: 'rgba(30,5,5,0.9)', // Tinte rojo suave al hacer foco
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '100%',
    },
    
    brandCol: { flex: 0.45, justifyContent: 'center', gap: 12 },
    radarCol: { flex: 0.35, justifyContent: 'center', alignItems: 'center' },
    actionCol: { flex: 0.20, alignItems: 'flex-end', justifyContent: 'center' },

    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    f1Brand: { color: 'rgba(255,255,255,0.9)', fontSize: 18, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
    
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(225,6,0,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2, borderWidth: 1, borderColor: F1_RED },
    pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: F1_RED },
    liveText: { color: F1_RED, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

    standbyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    standbyText: { color: '#a0a0a0', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

    title: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: 4, fontStyle: 'italic' },
    textGlow: { textShadowColor: F1_RED, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15 },

    metaRow: { flexDirection: 'row', gap: 20, marginTop: 4 },
    metaItem: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    metaVal: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    metaUnit: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },

    ctaBox: { 
        backgroundColor: 'rgba(255,255,255,0.03)', 
        borderWidth: 1, 
        borderColor: 'rgba(255,255,255,0.2)', 
        paddingHorizontal: 24, 
        paddingVertical: 18, 
        borderRadius: 2,
        alignItems: 'center',
        justifyContent: 'center',
        width: 180,
    },
    ctaBoxActive: {
        backgroundColor: F1_RED,
        borderColor: '#fff',
        shadowColor: F1_RED,
        shadowOpacity: 0.8,
        shadowRadius: 20,
    },
    ctaTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
    ctaSubRow: { borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 6, width: '100%', alignItems: 'center' },
    ctaDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 9, letterSpacing: 1, fontWeight: '700', textTransform: 'uppercase' },

    hudCornerTopLeft: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTopWidth: 2, borderLeftWidth: 2, borderColor: F1_RED, opacity: 0.5 },
    hudCornerBottomRight: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottomWidth: 2, borderRightWidth: 2, borderColor: F1_RED, opacity: 0.5 },
});
