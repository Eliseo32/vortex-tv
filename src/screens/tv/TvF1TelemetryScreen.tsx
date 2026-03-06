/**
 * TvF1TelemetryScreen — Pantalla de telemetría F1 en tiempo real
 * Diseño 3 columnas para Android TV
 * Mapa de circuito real via api.multiviewer.app
 */

import React, { useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    BackHandler, useWindowDimensions,
} from 'react-native';
import Svg, { Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { useF1Telemetry, F1Driver, TIRE_COLORS } from '../../hooks/useF1Telemetry';
import TvFocusable from '../../components/tv/TvFocusable';
import {
    Flag, Radio, Map, Settings, Tv2, Wifi, WifiOff,
    ChevronLeft, AlertTriangle, Timer, Zap,
} from 'lucide-react-native';

// ─── Design tokens ────────────────────────────────────────────────────────────
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

// ─── Seed data for when offline / no session ──────────────────────────────────
const MOCK_DRIVERS: F1Driver[] = [
    { position: 1, racingNumber: '1', broadcastName: 'VER', fullName: 'Max Verstappen', teamName: 'Red Bull Racing', teamColor: '#3671C6', gapToLeader: 'LÍDER', interval: '', lastLapTime: '1:19.456', bestLapTime: '1:19.012', lastLapPersonalBest: false, lastLapOverallBest: true, sectors: [{ time: '29.1', overallBest: true, personalBest: false }, { time: '38.2', overallBest: false, personalBest: false }, { time: '11.8', overallBest: false, personalBest: false }], tireCompound: 'MEDIUM', tireLaps: 14, inPit: false, pitCount: 1, drsActive: true, speed: 318, x: 0.5, y: 0.5 },
    { position: 2, racingNumber: '16', broadcastName: 'LEC', fullName: 'Charles Leclerc', teamName: 'Ferrari', teamColor: '#E8002D', gapToLeader: '+4.321', interval: '+4.321', lastLapTime: '1:19.821', bestLapTime: '1:19.234', lastLapPersonalBest: true, lastLapOverallBest: false, sectors: [{ time: '29.3', overallBest: false, personalBest: true }, { time: '38.4', overallBest: false, personalBest: false }, { time: '12.0', overallBest: false, personalBest: false }], tireCompound: 'SOFT', tireLaps: 7, inPit: false, pitCount: 1, drsActive: true, speed: 314, x: 0.3, y: 0.7 },
    { position: 3, racingNumber: '4', broadcastName: 'NOR', fullName: 'Lando Norris', teamName: 'McLaren', teamColor: '#FF8000', gapToLeader: '+8.765', interval: '+4.444', lastLapTime: '1:20.012', bestLapTime: '1:19.567', lastLapPersonalBest: false, lastLapOverallBest: false, sectors: [{ time: '29.5', overallBest: false, personalBest: false }, { time: '38.5', overallBest: false, personalBest: false }, { time: '11.9', overallBest: false, personalBest: false }], tireCompound: 'HARD', tireLaps: 22, inPit: false, pitCount: 1, drsActive: false, speed: 309, x: 0.7, y: 0.3 },
];

// ─── Component: Sector dots ───────────────────────────────────────────────────
const SectorDots = ({ sectors }: { sectors: F1Driver['sectors'] }) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
        {[0, 1, 2].map(i => {
            const s = sectors[i];
            const color = !s?.time ? '#333'
                : s.overallBest ? PURPLE
                    : s.personalBest ? GREEN
                        : YELLOW;
            return <View key={i} style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />;
        })}
    </View>
);

// ─── Component: Tire icon ─────────────────────────────────────────────────────
const TireIcon = ({ compound, laps }: { compound: string; laps: number }) => {
    const letter = compound === 'SOFT' ? 'S' : compound === 'MEDIUM' ? 'M' : compound === 'HARD' ? 'H' : compound === 'INTERMEDIATE' ? 'I' : 'W';
    const color = TIRE_COLORS[compound] || '#888';
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: compound === 'HARD' ? '#000' : '#fff', fontSize: 9, fontWeight: '900' }}>{letter}</Text>
            </View>
            <Text style={{ color: TEXT_DIM, fontSize: 10 }}>{laps}</Text>
        </View>
    );
};

// ─── Component: Driver Row ────────────────────────────────────────────────────
const DriverRow = ({ driver }: { driver: F1Driver }) => {
    const lapColor = driver.lastLapOverallBest ? PURPLE : driver.lastLapPersonalBest ? GREEN : TEXT;
    return (
        <View style={[styles.driverRow, driver.inPit && { opacity: 0.5 }]}>
            {/* Team color bar */}
            <View style={{ width: 3, height: '100%', backgroundColor: driver.teamColor, borderRadius: 2, marginRight: 6 }} />

            {/* Position */}
            <Text style={styles.driverPos}>{driver.position}</Text>

            {/* Name */}
            <View style={{ flex: 1 }}>
                <Text style={[styles.driverCode, { color: driver.teamColor }]}>{driver.broadcastName}</Text>
                {driver.inPit && <Text style={styles.driverPit}>PIT</Text>}
            </View>

            {/* Tire */}
            <TireIcon compound={driver.tireCompound} laps={driver.tireLaps} />

            {/* Gap */}
            <Text style={styles.driverGap}>{driver.gapToLeader || ''}</Text>

            {/* Last lap */}
            <Text style={[styles.driverLap, { color: lapColor }]}>{driver.lastLapTime || ''}</Text>

            {/* Sector dots */}
            <SectorDots sectors={driver.sectors} />

            {/* DRS */}
            {driver.drsActive && (
                <View style={styles.drsBadge}><Text style={styles.drsText}>DRS</Text></View>
            )}
        </View>
    );
};

// ─── Component: Circuit Map ────────────────────────────────────────────────────
const CircuitMap = ({ circuitPath, drivers }: { circuitPath: { x: number; y: number }[]; drivers: F1Driver[] }) => {
    const MAP_W = 320, MAP_H = 260;

    const pathPoints = useMemo(() => {
        if (!circuitPath.length) return '';
        return circuitPath
            .map(p => `${(p.x * MAP_W).toFixed(1)},${(p.y * MAP_H).toFixed(1)}`)
            .join(' ');
    }, [circuitPath, MAP_W, MAP_H]);

    if (!circuitPath.length) {
        return (
            <View style={[styles.mapPlaceholder]}>
                <Map color={TEXT_DIM} size={40} />
                <Text style={{ color: TEXT_DIM, marginTop: 8, fontSize: 12 }}>Mapa no disponible{'\n'}fuera de sesión</Text>
            </View>
        );
    }

    return (
        <Svg width={MAP_W} height={MAP_H}>
            {/* Circuit outline */}
            <Polyline
                points={pathPoints}
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Driver dots */}
            {drivers.slice(0, 20).map(d => {
                const cx = d.x * MAP_W;
                const cy = d.y * MAP_H;
                return (
                    <React.Fragment key={d.racingNumber}>
                        <Circle cx={cx} cy={cy} r={7} fill={d.teamColor} opacity={0.9} />
                        <SvgText
                            x={cx} y={cy + 4}
                            textAnchor="middle"
                            fontSize={7}
                            fontWeight="bold"
                            fill={d.teamColor === '#FFFFFF' ? '#000' : '#fff'}
                        >
                            {d.position}
                        </SvgText>
                    </React.Fragment>
                );
            })}
        </Svg>
    );
};

// ─── Component: Flag indicator ────────────────────────────────────────────────
const FlagBadge = ({ flag }: { flag: string }) => {
    const map: Record<string, { color: string; label: string }> = {
        GREEN: { color: GREEN, label: '🟢 VÍA LIBRE' },
        YELLOW: { color: YELLOW, label: '🟡 BANDERA AMARILLA' },
        RED: { color: F1_RED, label: '🔴 BANDERA ROJA' },
        SC: { color: YELLOW, label: '🚗 SAFETY CAR' },
        VSC: { color: YELLOW, label: '🚗 VIRTUAL SC' },
        CHEQUERED: { color: TEXT, label: '🏁 BANDERA A CUADROS' },
    };
    const info = map[flag] || map['GREEN'];
    return (
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: `${info.color}22`, borderWidth: 1, borderColor: `${info.color}66` }}>
            <Text style={{ color: info.color, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>{info.label}</Text>
        </View>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TvF1TelemetryScreen() {
    const navigation = useNavigation<any>();
    const { width } = useWindowDimensions();
    const [activeTab, setActiveTab] = useState<'telemetry' | 'map' | 'radio'>('telemetry');

    const { isLive, isLoading, error, session, drivers, raceControl, fastestLap, circuitPath, lastUpdate } =
        useF1Telemetry(true);

    // Usar data real o mock cuando no hay sesión
    const displayDrivers = isLive && drivers.length > 0 ? drivers : MOCK_DRIVERS;

    useEffect(() => {
        const h = BackHandler.addEventListener('hardwareBackPress', () => { navigation.goBack(); return true; });
        return () => h.remove();
    }, [navigation]);

    const topBar = (
        <View style={styles.topBar}>
            <TvFocusable onPress={() => navigation.goBack()} scaleTo={1.1} borderWidth={0}
                style={styles.backBtn} focusedStyle={styles.backBtnFocused}>
                {(f: boolean) => <ChevronLeft color={f ? GOLD : TEXT} size={28} />}
            </TvFocusable>

            <View style={styles.topTitle}>
                <Text style={styles.titleMain}>F1 TELEMETRÍA</Text>
                {session && (
                    <Text style={styles.titleSub}>
                        {session.gp}  ·  {session.localizedName}
                        {session.totalLaps > 0 ? `  ·  VUELTA ${session.currentLap}/${session.totalLaps}` : ''}
                    </Text>
                )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {session && <FlagBadge flag={session.flag} />}
                {isLive ? (
                    <View style={styles.liveBadge}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>EN VIVO</Text>
                    </View>
                ) : (
                    <View style={styles.offlineBadge}>
                        <WifiOff color={TEXT_DIM} size={14} />
                        <Text style={{ color: TEXT_DIM, fontSize: 11, marginLeft: 4 }}>Sin sesión activa</Text>
                    </View>
                )}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {topBar}

            {/* ── CUERPO PRINCIPAL ─────────────────────────────────────────── */}
            <View style={styles.body}>

                {/* ── COLUMNA IZQUIERDA: Leaderboard ────────────────────── */}
                <View style={[styles.column, styles.leftCol]}>
                    <Text style={styles.colHeader}>CLASIFICACIÓN</Text>

                    {/* Header row */}
                    <View style={styles.leaderboardHeader}>
                        <Text style={[styles.lhCell, { width: 20 }]}>#</Text>
                        <Text style={[styles.lhCell, { flex: 1 }]}>PILOTO</Text>
                        <Text style={[styles.lhCell, { width: 36 }]}>NEU</Text>
                        <Text style={[styles.lhCell, { width: 64 }]}>GAP</Text>
                        <Text style={[styles.lhCell, { width: 70 }]}>ÚLTIMA</Text>
                        <Text style={[styles.lhCell, { width: 30 }]}>S</Text>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {displayDrivers.map(d => <DriverRow key={d.racingNumber} driver={d} />)}
                    </ScrollView>
                </View>

                {/* ── COLUMNA CENTRO: Mapa del circuito ─────────────────── */}
                <View style={[styles.column, styles.midCol]}>
                    <Text style={styles.colHeader}>CIRCUITO</Text>
                    <View style={styles.mapContainer}>
                        <CircuitMap circuitPath={circuitPath} drivers={displayDrivers} />
                    </View>

                    {/* Fastest lap card */}
                    {fastestLap && (
                        <View style={[styles.card, { borderColor: PURPLE, marginTop: 12 }]}>
                            <Text style={[styles.cardTitle, { color: PURPLE }]}>⚡ VUELTA RÁPIDA</Text>
                            <Text style={[styles.cardValue, { color: PURPLE }]}>{fastestLap.time}</Text>
                            <Text style={{ color: fastestLap.teamColor, fontSize: 15, fontWeight: '900' }}>
                                {fastestLap.driver}
                            </Text>
                            <Text style={{ color: TEXT_DIM, fontSize: 10 }}>
                                Vuelta {fastestLap.lap} · {fastestLap.team}
                            </Text>
                        </View>
                    )}

                    {lastUpdate && (
                        <Text style={styles.updateTime}>
                            Actualizado: {lastUpdate.toLocaleTimeString()}
                        </Text>
                    )}
                </View>

                {/* ── COLUMNA DERECHA: Race Control + Stats ─────────────── */}
                <View style={[styles.column, styles.rightCol]}>
                    <Text style={styles.colHeader}>RACE CONTROL</Text>

                    {raceControl.length === 0 && !isLive && (
                        <View style={[styles.card, { alignItems: 'center', paddingVertical: 20 }]}>
                            <AlertTriangle color={TEXT_DIM} size={28} />
                            <Text style={{ color: TEXT_DIM, marginTop: 8, fontSize: 12, textAlign: 'center' }}>
                                No hay mensajes de Race Control.{'\n'}Disponible durante sesión en vivo.
                            </Text>
                        </View>
                    )}

                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        {raceControl.map((msg, i) => {
                            const fColor = msg.flag === 'YELLOW' ? YELLOW
                                : msg.flag === 'RED' ? F1_RED
                                    : msg.flag === 'GREEN' ? GREEN
                                        : TEXT;
                            return (
                                <View key={i} style={[styles.rcMsg, { borderLeftColor: fColor }]}>
                                    <Text style={{ color: TEXT_DIM, fontSize: 9 }}>{msg.utcTime}</Text>
                                    <Text style={{ color: fColor, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{msg.message}</Text>
                                </View>
                            );
                        })}

                        {/* Pilotos más rápidos (top 3 speed) */}
                        {displayDrivers.slice(0, 3).filter(d => d.speed > 0).length > 0 && (
                            <View style={[styles.card, { marginTop: 10 }]}>
                                <Text style={styles.cardTitle}><Zap size={11} color={GOLD} /> TOP SPEED</Text>
                                {displayDrivers
                                    .filter(d => d.speed > 0)
                                    .sort((a, b) => b.speed - a.speed)
                                    .slice(0, 3)
                                    .map((d, i) => (
                                        <View key={d.racingNumber} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                                            <Text style={{ color: d.teamColor, fontWeight: '900', fontSize: 13 }}>
                                                {['🥇', '🥈', '🥉'][i]} {d.broadcastName}
                                            </Text>
                                            <Text style={{ color: TEXT, fontWeight: '700', fontSize: 13 }}>
                                                {d.speed} km/h
                                            </Text>
                                        </View>
                                    ))}
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>

            {/* ── BOTTOM NAV ──────────────────────────────────────────────── */}
            <View style={styles.bottomBar}>
                {[
                    { id: 'streams', label: 'STREAMS', icon: Tv2 },
                    { id: 'telemetry', label: 'TELEMETRÍA', icon: Wifi },
                    { id: 'map', label: 'MAPA', icon: Map },
                    { id: 'radio', label: 'RADIO', icon: Radio },
                ].map(tab => (
                    <TvFocusable key={tab.id}
                        onPress={() => tab.id === 'streams' ? navigation.goBack() : setActiveTab(tab.id as any)}
                        scaleTo={1.08} borderWidth={0}
                        style={[styles.navBtn, activeTab === tab.id && { borderColor: GOLD, backgroundColor: `${GOLD}15` }]}
                        focusedStyle={[styles.navBtnFocused]}>
                        {(f: boolean) => (
                            <View style={{ alignItems: 'center', gap: 4 }}>
                                <tab.icon color={f || activeTab === tab.id ? GOLD : TEXT_DIM} size={20} />
                                <Text style={{ color: f || activeTab === tab.id ? GOLD : TEXT_DIM, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>
                                    {tab.label}
                                </Text>
                            </View>
                        )}
                    </TvFocusable>
                ))}
            </View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: BG },

    // Top bar
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD_BG, gap: 16 },
    backBtn: { borderRadius: 20, padding: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
    backBtnFocused: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 2, borderColor: GOLD },
    topTitle: { flex: 1 },
    titleMain: { color: F1_RED, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
    titleSub: { color: TEXT_DIM, fontSize: 11, marginTop: 2, letterSpacing: 0.3 },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${F1_RED}20`, borderWidth: 1, borderColor: `${F1_RED}50`, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: F1_RED },
    liveText: { color: F1_RED, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.05)' },

    // Body
    body: { flex: 1, flexDirection: 'row', padding: 12, gap: 10 },
    column: { backgroundColor: CARD_BG, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER },
    leftCol: { flex: 0.38 },
    midCol: { flex: 0.30, alignItems: 'center' },
    rightCol: { flex: 0.32 },
    colHeader: { color: TEXT_DIM, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' },

    // Leaderboard
    leaderboardHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 4 },
    lhCell: { color: TEXT_DIM, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
    driverRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', gap: 5 },
    driverPos: { color: TEXT, fontWeight: '900', fontSize: 13, width: 22, textAlign: 'center' },
    driverCode: { fontWeight: '900', fontSize: 12, letterSpacing: 0.3 },
    driverPit: { color: YELLOW, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
    driverGap: { color: TEXT_DIM, fontSize: 10, width: 60, textAlign: 'right' },
    driverLap: { fontSize: 10, fontWeight: '700', width: 66, textAlign: 'right' },
    drsBadge: { backgroundColor: `${GREEN}22`, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
    drsText: { color: GREEN, fontSize: 8, fontWeight: '900' },

    // Map
    mapContainer: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#06080b', padding: 8 },
    mapPlaceholder: { width: 320, height: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0c10', borderRadius: 10 },

    // Cards
    card: { backgroundColor: '#0a0c10', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER, width: '100%' },
    cardTitle: { color: TEXT_DIM, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
    cardValue: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
    updateTime: { color: TEXT_DIM, fontSize: 9, marginTop: 6, opacity: 0.6 },

    // Race control
    rcMsg: { borderLeftWidth: 2, borderLeftColor: TEXT_DIM, paddingLeft: 8, paddingVertical: 5, marginBottom: 6 },

    // Bottom nav
    bottomBar: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 28, paddingVertical: 12, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: CARD_BG },
    navBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: 'rgba(255,255,255,0.04)', minWidth: 100, alignItems: 'center' },
    navBtnFocused: { borderColor: GOLD, backgroundColor: `${GOLD}15` },
});
