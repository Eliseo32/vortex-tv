/**
 * F1TelemetrySidePanel — Panel lateral de telemetría F1
 * Se muestra al lado del reproductor de video (modo split-screen)
 * 35% del ancho de pantalla, 100% alto
 *
 * Usa el hook useF1Telemetry del contexto F1BridgeProvider.
 * Si no hay provider, muestra placeholder.
 */

import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
} from 'react-native';
import Svg, { Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { useF1Telemetry, F1BridgeProvider, getTeamColor, TIRE_COLORS, F1Driver } from '../../hooks/useF1Telemetry';
import TvFocusable from './TvFocusable';
import { Maximize2, X, WifiOff, Map } from 'lucide-react-native';

// ─── Tokens ──────────────────────────────────────────────────────────────────
const BG = '#06080b';
const CARD_BG = '#0d1117';
const BORDER = 'rgba(255,255,255,0.07)';
const F1_RED = '#e10600';
const GOLD = '#FFD700';
const TEXT = '#FFFFFF';
const TEXT_DIM = '#8B949E';
const PURPLE = '#9B59B6';
const GREEN = '#2ECC71';
const YELLOW = '#F1C40F';

// ─── Mini Tire Dot ────────────────────────────────────────────────────────────
const TireDot = ({ compound }: { compound: string }) => {
    const color = TIRE_COLORS[compound] || '#888';
    const letter = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' }[compound] || '?';
    return (
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: compound === 'HARD' ? '#000' : '#fff', fontSize: 7, fontWeight: '900' }}>{letter}</Text>
        </View>
    );
};

// ─── Sector dots ─────────────────────────────────────────────────────────────
const SSectors = ({ sectors }: { sectors: F1Driver['sectors'] }) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
        {[0, 1, 2].map(i => (
            <View key={i} style={{
                width: 6, height: 6, borderRadius: 1,
                backgroundColor: !sectors[i]?.time ? '#333'
                    : sectors[i].overallBest ? PURPLE
                        : sectors[i].personalBest ? GREEN
                            : YELLOW,
            }} />
        ))}
    </View>
);

// ─── Mini Circuit Map ─────────────────────────────────────────────────────────
const MiniMap = ({
    circuitPath,
    drivers,
    width = 220,
    height = 160,
}: {
    circuitPath: { x: number; y: number }[];
    drivers: F1Driver[];
    width?: number;
    height?: number;
}) => {
    const pathStr = circuitPath
        .map(p => `${(p.x * width).toFixed(1)},${(p.y * height).toFixed(1)}`)
        .join(' ');

    if (!circuitPath.length) {
        return (
            <View style={{ width, height, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0c10', borderRadius: 8 }}>
                <Map color={TEXT_DIM} size={24} />
                <Text style={{ color: TEXT_DIM, fontSize: 9, marginTop: 4 }}>Sin sesión</Text>
            </View>
        );
    }

    return (
        <Svg width={width} height={height}>
            <Polyline points={pathStr} stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {drivers.slice(0, 20).filter(d => d.x !== 0.5 && d.y !== 0.5).map(d => {
                const cx = d.x * width;
                const cy = d.y * height;
                return (
                    <React.Fragment key={d.racingNumber}>
                        <Circle cx={cx} cy={cy} r={5} fill={d.teamColor} opacity={0.9} />
                        <SvgText x={cx} y={cy + 3.5} textAnchor="middle" fontSize={5.5} fontWeight="bold" fill="#fff">
                            {d.position}
                        </SvgText>
                    </React.Fragment>
                );
            })}
        </Svg>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────
interface F1TelemetrySidePanelProps {
    onClose: () => void;
    onFullScreen: () => void;
}

export default function F1TelemetrySidePanel(props: F1TelemetrySidePanelProps) {
    return (
        <F1BridgeProvider>
            {() => <F1TelemetrySidePanelInner {...props} />}
        </F1BridgeProvider>
    );
}

function F1TelemetrySidePanelInner({ onClose, onFullScreen }: F1TelemetrySidePanelProps) {
    const {
        isLive, isFinalised, session, drivers,
        raceControl, fastestLap, circuitPath, lastUpdate,
    } = useF1Telemetry(true);

    const [tab, setTab] = useState<'board' | 'map'>('board');
    const topDrivers = drivers.slice(0, 10);
    const hasSession = isLive || isFinalised;

    const flagColor = {
        GREEN, YELLOW, RED: F1_RED, SC: YELLOW, VSC: YELLOW, CHEQUERED: '#fff',
    }[session?.flag || 'GREEN'] || GREEN;

    return (
        <View style={styles.root}>
            {/* Header */}
            <View style={styles.header}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>⚡ F1 TELEMETRÍA</Text>
                    {session ? (
                        <Text numberOfLines={1} style={styles.headerSub}>
                            {session.localizedName}
                            {session.totalLaps > 0 ? `  V.${session.currentLap}/${session.totalLaps}` : ''}
                        </Text>
                    ) : (
                        <Text style={styles.headerSub}>Sin sesión activa</Text>
                    )}
                </View>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                    {/* Live indicator */}
                    {hasSession ? (
                        <View style={[styles.livePill, { borderColor: flagColor, backgroundColor: `${flagColor}20` }]}>
                            <View style={[styles.liveDot, { backgroundColor: flagColor }]} />
                            <Text style={[styles.liveTxt, { color: flagColor }]}>
                                {isFinalised ? 'FIN' : session?.flag === 'SC' ? 'SC' : session?.flag === 'VSC' ? 'VSC' : 'VIVO'}
                            </Text>
                        </View>
                    ) : (
                        <WifiOff color={TEXT_DIM} size={13} />
                    )}

                    {/* Full screen */}
                    <TvFocusable onPress={onFullScreen} scaleTo={1.1} borderWidth={0}
                        style={styles.iconBtn} focusedStyle={styles.iconBtnFocused}>
                        {(f: boolean) => <Maximize2 color={f ? GOLD : TEXT_DIM} size={14} />}
                    </TvFocusable>

                    {/* Close */}
                    <TvFocusable onPress={onClose} scaleTo={1.1} borderWidth={0}
                        style={styles.iconBtn} focusedStyle={[styles.iconBtnFocused, { borderColor: F1_RED }]}>
                        {(f: boolean) => <X color={f ? F1_RED : TEXT_DIM} size={14} />}
                    </TvFocusable>
                </View>
            </View>

            {/* Tab selector */}
            <View style={styles.tabRow}>
                {([['board', 'CLASIFICACIÓN'], ['map', 'MAPA']] as const).map(([id, label]) => (
                    <TvFocusable key={id} onPress={() => setTab(id)} borderWidth={0} scaleTo={1.05}
                        style={[styles.tabBtn, tab === id && styles.tabBtnActive]}
                        focusedStyle={styles.tabBtnFocused}>
                        {(f: boolean) => (
                            <Text style={[styles.tabTxt, (f || tab === id) && { color: GOLD }]}>{label}</Text>
                        )}
                    </TvFocusable>
                ))}
            </View>

            {/* Content */}
            <View style={{ flex: 1 }}>
                {tab === 'board' ? (
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        {/* Top 10 */}
                        {(hasSession ? topDrivers : []).map(d => {
                            const lapColor = d.lastLapOverallBest ? PURPLE : d.lastLapPersonalBest ? GREEN : TEXT;
                            return (
                                <View key={d.racingNumber} style={[
                                    styles.driverRow,
                                    d.inPit && { opacity: 0.45 },
                                ]}>
                                    {/* Team bar */}
                                    <View style={{ width: 2, height: '100%', backgroundColor: d.teamColor, borderRadius: 1, marginRight: 5 }} />

                                    {/* Pos */}
                                    <Text style={styles.pos}>{d.position}</Text>

                                    {/* Code */}
                                    <Text style={[styles.code, { color: d.teamColor }]}>{d.broadcastName}</Text>

                                    {/* Tire */}
                                    <TireDot compound={d.tireCompound} />

                                    {/* Gap */}
                                    <Text style={styles.gap}>{d.gapToLeader}</Text>

                                    {/* Last lap */}
                                    <Text style={[styles.lap, { color: lapColor }]}>{d.lastLapTime}</Text>

                                    {/* Sectors */}
                                    <SSectors sectors={d.sectors} />

                                    {/* DRS */}
                                    {d.drsActive && (
                                        <View style={styles.drsPill}><Text style={styles.drsTxt}>D</Text></View>
                                    )}
                                </View>
                            );
                        })}

                        {!hasSession && (
                            <View style={styles.noSession}>
                                <WifiOff color={TEXT_DIM} size={22} />
                                <Text style={styles.noSessionTxt}>Sin sesión F1 en vivo</Text>
                            </View>
                        )}

                        {/* Fastest lap */}
                        {fastestLap && (
                            <View style={styles.flCard}>
                                <Text style={styles.flTitle}>⚡ VUELTA RÁPIDA</Text>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ color: fastestLap.teamColor, fontWeight: '900', fontSize: 13 }}>
                                        {fastestLap.driver}
                                    </Text>
                                    <Text style={{ color: PURPLE, fontWeight: '900', fontSize: 13 }}>
                                        {fastestLap.time}
                                    </Text>
                                </View>
                                <Text style={{ color: TEXT_DIM, fontSize: 9, marginTop: 2 }}>
                                    {fastestLap.team}
                                </Text>
                            </View>
                        )}

                        {/* Latest Race Control */}
                        {raceControl.slice(0, 3).map((m, i) => {
                            const c = m.flag?.includes('YELLOW') ? YELLOW :
                                m.flag?.includes('RED') ? F1_RED :
                                    m.flag?.includes('GREEN') ? GREEN : TEXT_DIM;
                            return (
                                <View key={i} style={[styles.rcRow, { borderLeftColor: c }]}>
                                    <Text style={{ color: c, fontSize: 9, fontWeight: '700' }}>{m.message}</Text>
                                </View>
                            );
                        })}
                    </ScrollView>
                ) : (
                    /* MAP TAB */
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                        <MiniMap circuitPath={circuitPath} drivers={hasSession ? drivers : []} width={240} height={180} />
                        {session && (
                            <Text style={{ color: TEXT_DIM, fontSize: 10, marginTop: 8, textAlign: 'center' }}>
                                {session.circuitName}
                            </Text>
                        )}
                        {lastUpdate && (
                            <Text style={{ color: TEXT_DIM, fontSize: 9, marginTop: 4, opacity: 0.5 }}>
                                {lastUpdate.toLocaleTimeString()}
                            </Text>
                        )}
                    </View>
                )}
            </View>

            {/* Go to full screen CTA */}
            <TvFocusable onPress={onFullScreen} borderWidth={0} scaleTo={1.04}
                style={styles.fullscreenBtn} focusedStyle={styles.fullscreenBtnFocused}>
                {(f: boolean) => (
                    <Text style={{ color: f ? '#000' : GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>
                        PANTALLA COMPLETA →
                    </Text>
                )}
            </TvFocusable>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: {
        flex: 1, backgroundColor: BG,
        borderLeftWidth: 1, borderLeftColor: `${F1_RED}40`,
    },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: BORDER,
        backgroundColor: CARD_BG, gap: 6,
    },
    headerTitle: { color: F1_RED, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
    headerSub: { color: TEXT_DIM, fontSize: 9, marginTop: 1 },
    livePill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    },
    liveDot: { width: 5, height: 5, borderRadius: 3 },
    liveTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    iconBtn: { borderRadius: 6, padding: 6, backgroundColor: 'rgba(255,255,255,0.05)' },
    iconBtnFocused: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: GOLD },

    // Tabs
    tabRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, gap: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
    tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
    tabBtnActive: { backgroundColor: `${GOLD}15`, borderWidth: 1, borderColor: `${GOLD}40` },
    tabBtnFocused: { backgroundColor: `${GOLD}20` },
    tabTxt: { color: TEXT_DIM, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

    // Driver rows
    driverRow: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 5,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    pos: { color: TEXT, fontWeight: '900', fontSize: 11, width: 16, textAlign: 'center' },
    code: { fontWeight: '900', fontSize: 10, width: 28, letterSpacing: 0.2 },
    gap: { color: TEXT_DIM, fontSize: 9, flex: 1, textAlign: 'right' },
    lap: { fontSize: 9, fontWeight: '700', width: 52, textAlign: 'right' },
    drsPill: { backgroundColor: `${GREEN}25`, borderRadius: 2, paddingHorizontal: 3 },
    drsTxt: { color: GREEN, fontSize: 7, fontWeight: '900' },

    // No session
    noSession: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    noSessionTxt: { color: TEXT_DIM, fontSize: 12 },

    // Fastest lap
    flCard: {
        margin: 8, padding: 10, borderRadius: 8,
        backgroundColor: `${PURPLE}14`, borderWidth: 1, borderColor: `${PURPLE}40`,
    },
    flTitle: { color: PURPLE, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },

    // Race control
    rcRow: {
        marginHorizontal: 8, marginBottom: 4, borderLeftWidth: 2,
        paddingLeft: 6, paddingVertical: 4, borderLeftColor: TEXT_DIM,
    },

    // CTA
    fullscreenBtn: {
        margin: 8, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
        borderWidth: 1, borderColor: `${GOLD}40`, backgroundColor: `${GOLD}10`,
    },
    fullscreenBtnFocused: { backgroundColor: GOLD, borderColor: GOLD },
});
