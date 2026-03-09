/**
 * TvF1TelemetryScreen — Dashboard de telemetría F1 para Android TV
 *
 * Layout 3 columnas (cuando hay sesión):
 *   Izq 38% — Leaderboard (20 pilotos)
 *   Centro 30% — Mapa circuito / Estado pista / Vuelta rápida
 *   Der 32% — Race Control / Top Speed
 *
 * Tabs: STREAMS | TELEMETRÍA | MAPA | RADIO
 * Sin sesión: Countdown + Última sesión + Calendario
 */

import React, { useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, useWindowDimensions,
} from 'react-native';
import Svg, { Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import {
    F1BridgeProvider, useF1Telemetry, getTeamColor,
    TIRE_COLORS, F1Driver, F1RaceControlMsg, F1TeamRadio,
    F1NextSession, F1TelemetryState,
} from '../../hooks/useF1Telemetry';
import TvFocusable from '../../components/tv/TvFocusable';
import {
    ChevronLeft, Wifi, WifiOff, Map, Radio, Tv2, Zap,
    AlertTriangle, Calendar, Flag, Timer, Activity,
    Headphones,
} from 'lucide-react-native';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG = '#06080b';
const CARD = '#0d1117';
const CARD2 = '#0a0c10';
const BORDER = 'rgba(255,255,255,0.07)';
const GOLD = '#B026FF';
const F1_RED = '#E8002D';
const PURPLE = '#9B59B6';
const GREEN = '#2ECC71';
const YELLOW = '#F1C40F';
const TEXT = '#FFFFFF';
const DIM = '#8B949E';

type Tab = 'streams' | 'telemetry' | 'map' | 'radio';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCountdown(ms: number) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return { d, h, m, s };
}

function flagStatusColor(flag: string): string {
    if (!flag) return GREEN;
    const f = flag.toUpperCase();
    if (f.includes('RED')) return F1_RED;
    if (f.includes('YELLOW') || f.includes('SC') || f.includes('VSC')) return YELLOW;
    if (f.includes('CHEQUERED')) return '#FFF';
    return GREEN;
}

function flagEmoji(flag?: string): string {
    if (!flag) return '🟢';
    const f = flag.toUpperCase();
    if (f.includes('RED')) return '🔴';
    if (f.includes('YELLOW') || f.includes('DOUBLE')) return '🟡';
    if (f.includes('BLUE')) return '🔵';
    if (f.includes('CHEQUERED')) return '🏁';
    return '🟢';
}

// ═══ Main Component (wrapper con F1BridgeProvider) ═══════════════════════════
export default function TvF1TelemetryScreen() {
    return (
        <F1BridgeProvider>
            {(state) => <TelemetryDashboard state={state} />}
        </F1BridgeProvider>
    );
}

// ═══ Dashboard ═══════════════════════════════════════════════════════════════
function TelemetryDashboard({ state }: { state: F1TelemetryState }) {
    const navigation = useNavigation<any>();
    const { width, height } = useWindowDimensions();
    const [tab, setTab] = useState<Tab>('telemetry');

    const {
        isLive, isFinalised, isLoading, session, drivers,
        raceControl, fastestLap, circuitPath, nextSession,
        teamRadios, bridgeReady, sessionClock,
    } = state;

    const hasSession = isLive || isFinalised || (session !== null);
    const flagC = flagStatusColor(session?.flag || '');

    // Tab STREAMS -> navigate to sports
    const goStreams = () => {
        try { navigation.navigate('LiveTV' as any); } catch { navigation.goBack(); }
    };

    return (
        <View style={s.root}>
            {/* ─── Header ──────────────────────────────────────────────── */}
            <View style={[s.header, { borderBottomColor: `${flagC}40` }]}>
                <TvFocusable onPress={() => navigation.goBack()} borderWidth={0} scaleTo={1.1}
                    style={s.backBtn} focusedStyle={s.backBtnFocused}>
                    {(f: boolean) => <ChevronLeft color={f ? GOLD : DIM} size={20} />}
                </TvFocusable>

                <Zap color={GOLD} size={18} />
                <Text style={s.headerBrand}>F1 LIVE</Text>

                {session && (
                    <>
                        <View style={s.headerSep} />
                        <Text style={s.headerGp} numberOfLines={1}>{session.gp}</Text>
                    </>
                )}

                <View style={{ flex: 1 }} />

                {/* Lap counter + session time */}
                {session && session.totalLaps > 0 && (
                    <View style={s.lapBox}>
                        <Text style={s.lapLabel}>VUELTA</Text>
                        <Text style={s.lapValue}>{session.currentLap}/{session.totalLaps}</Text>
                    </View>
                )}

                {/* Session time remaining (ExtrapolatedClock) */}
                {sessionClock && sessionClock.remaining && (
                    <View style={[s.lapBox, { marginLeft: 8, borderColor: sessionClock.paused ? `${GOLD}50` : '#2ECC7150' }]}>
                        <Text style={s.lapLabel}>{sessionClock.paused ? '⏸ PAUSA' : '⏱ RESTO'}</Text>
                        <Text style={[s.lapValue, { color: sessionClock.paused ? GOLD : '#2ECC71' }]}>
                            {sessionClock.remaining}
                        </Text>
                    </View>
                )}

                {/* Live badge */}
                {hasSession && (
                    <View style={[s.liveBadge, { backgroundColor: isFinalised ? '#374151' : `${flagC}20`, borderColor: isFinalised ? '#4B5563' : flagC }]}>
                        {!isFinalised && <View style={[s.liveDot, { backgroundColor: flagC }]} />}
                        <Text style={[s.liveTxt, { color: isFinalised ? DIM : flagC }]}>
                            {isFinalised ? 'FINALIZADO' : 'EN VIVO'}
                        </Text>
                    </View>
                )}

                {!hasSession && nextSession && (
                    <View style={s.nextBadge}>
                        <Timer color={DIM} size={12} />
                        <Text style={s.nextTxt}>
                            Siguiente: {nextSession.countryName} - {nextSession.sessionName}
                        </Text>
                    </View>
                )}
            </View>

            {/* ─── Content ─────────────────────────────────────────────── */}
            <View style={s.content}>
                {isLoading && !hasSession && drivers.length === 0 ? (
                    <LoadingView bridgeReady={bridgeReady} />
                ) : tab === 'streams' ? (
                    <StreamsRedirect onGo={goStreams} />
                ) : tab === 'map' ? (
                    <MapFullView drivers={drivers} circuitPath={circuitPath} session={session} w={width} h={height - 120} />
                ) : tab === 'radio' ? (
                    <RadioView raceControl={raceControl} teamRadios={teamRadios} drivers={drivers} />
                ) : hasSession ? (
                    <LiveLayout
                        drivers={drivers} raceControl={raceControl}
                        fastestLap={fastestLap} circuitPath={circuitPath}
                        session={session} sessionClock={sessionClock}
                    />
                ) : (
                    <OfflineLayout nextSession={nextSession} drivers={drivers} />
                )}
            </View>

            {/* ─── Tab Bar ─────────────────────────────────────────────── */}
            <View style={s.tabBar}>
                {([
                    { id: 'streams' as Tab, icon: Tv2, label: 'STREAMS' },
                    { id: 'telemetry' as Tab, icon: Activity, label: 'TELEMETRÍA' },
                    { id: 'map' as Tab, icon: Map, label: 'MAPA' },
                    { id: 'radio' as Tab, icon: Headphones, label: 'RADIO' },
                ]).map(({ id, icon: Icon, label }) => (
                    <TvFocusable key={id} onPress={() => id === 'streams' ? goStreams() : setTab(id)}
                        borderWidth={0} scaleTo={1.05}
                        style={[s.tabItem, tab === id && s.tabItemActive]}
                        focusedStyle={s.tabItemFocused}>
                        {(f: boolean) => (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Icon color={f || tab === id ? GOLD : DIM} size={14} />
                                <Text style={[s.tabLabel, (f || tab === id) && { color: GOLD }]}>{label}</Text>
                            </View>
                        )}
                    </TvFocusable>
                ))}

                <View style={{ flex: 1 }} />
                <Text style={s.footerSrc}>Fuente: f1telemetry.com</Text>
                <Text style={s.footerBrand}>VORTEX</Text>
            </View>
        </View>
    );
}

// ═══ Sub-views ═══════════════════════════════════════════════════════════════

function LoadingView({ bridgeReady }: { bridgeReady: boolean }) {
    return (
        <View style={s.center}>
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={s.loadingText}>
                {bridgeReady ? 'OBTENIENDO DATOS F1...' : 'CONECTANDO A F1 LIVE TIMING...'}
            </Text>
        </View>
    );
}

function StreamsRedirect({ onGo }: { onGo: () => void }) {
    return (
        <View style={s.center}>
            <Tv2 color={GOLD} size={48} />
            <Text style={{ color: TEXT, fontSize: 16, fontWeight: '900', marginTop: 12 }}>STREAMS DE F1</Text>
            <Text style={{ color: DIM, marginTop: 4, textAlign: 'center' }}>
                Redirigiendo a los canales deportivos...
            </Text>
            <TouchableOpacity onPress={onGo} style={{ marginTop: 16, backgroundColor: GOLD, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 }}>
                <Text style={{ color: '#000', fontWeight: '900' }}>IR A CANALES</Text>
            </TouchableOpacity>
        </View>
    );
}

// ─── Live 3-Column Layout ─────────────────────────────────────────────────────
function LiveLayout({ drivers, raceControl, fastestLap, circuitPath, session }: any) {
    return (
        <View style={s.threeCol}>
            {/* Col 1: Leaderboard */}
            <View style={s.col1}>
                <Text style={s.colTitle}>
                    {session?.localizedName || 'CLASIFICACIÓN'}
                </Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                    {drivers.map((d: F1Driver) => (
                        <DriverRow key={d.racingNumber} d={d} />
                    ))}
                </ScrollView>
            </View>

            {/* Col 2: Map + Status */}
            <View style={s.col2}>
                <View style={s.trackStatusBadge}>
                    <View style={[s.trackDot, { backgroundColor: flagStatusColor(session?.flag) }]} />
                    <Text style={[s.trackStatusText, { color: flagStatusColor(session?.flag) }]}>
                        TRACK STATUS: {(session?.flag || 'GREEN').toUpperCase()}
                    </Text>
                </View>

                <CircuitMap drivers={drivers} circuitPath={circuitPath} size={220} />

                {fastestLap && (
                    <View style={s.flCard}>
                        <Text style={s.flTitle}>⚡ VUELTA RÁPIDA</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: fastestLap.teamColor, fontWeight: '900', fontSize: 13 }}>
                                {fastestLap.driver}
                            </Text>
                            <Text style={{ color: PURPLE, fontWeight: '900', fontSize: 13 }}>
                                {fastestLap.time}
                            </Text>
                        </View>
                    </View>
                )}
            </View>

            {/* Col 3: Race Control + Speed */}
            <View style={s.col3}>
                <Text style={s.colTitle}>🏁 RACE CONTROL</Text>
                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                    {raceControl.slice(0, 15).map((m: F1RaceControlMsg, i: number) => {
                        const c = m.flag?.includes('YELLOW') ? YELLOW :
                            m.flag?.includes('RED') ? F1_RED :
                                m.flag?.includes('GREEN') ? GREEN :
                                    m.flag?.includes('BLUE') ? '#3B82F6' : DIM;
                        return (
                            <View key={i} style={[s.rcItem, { borderLeftColor: c }]}>
                                {m.category && (
                                    <View style={[s.rcCatBadge, { backgroundColor: `${c}20` }]}>
                                        <Text style={[s.rcCatText, { color: c }]}>{m.category}</Text>
                                    </View>
                                )}
                                <Text style={s.rcMsg}>{m.message}</Text>
                                <Text style={s.rcTime}>{m.utcTime?.slice(11, 19) || ''}</Text>
                            </View>
                        );
                    })}
                    {raceControl.length === 0 && (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <AlertTriangle color={DIM} size={20} />
                            <Text style={{ color: DIM, fontSize: 11, marginTop: 8 }}>Sin mensajes activos</Text>
                        </View>
                    )}
                </ScrollView>

                {/* Top Speed */}
                <View style={s.topSpeedCard}>
                    <Text style={s.topSpeedTitle}>⚡ TOP SPEED (km/h)</Text>
                    {drivers.slice().sort((a: F1Driver, b: F1Driver) => b.speed - a.speed).slice(0, 4).map((d: F1Driver) => (
                        <View key={d.racingNumber} style={s.topSpeedRow}>
                            <View style={[s.topSpeedBar, { backgroundColor: d.teamColor }]} />
                            <Text style={{ color: d.teamColor, fontWeight: '900', fontSize: 11, width: 32 }}>{d.broadcastName}</Text>
                            <Text style={s.topSpeedVal}>{d.speed > 0 ? d.speed : '—'}</Text>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

// ─── Driver Row ───────────────────────────────────────────────────────────────
function DriverRow({ d }: { d: F1Driver }) {
    const lapColor = d.lastLapOverallBest ? PURPLE : d.lastLapPersonalBest ? GREEN : TEXT;
    const tireC = TIRE_COLORS[d.tireCompound] || '#555';
    const tireL = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W', UNKNOWN: '?' }[d.tireCompound] || '?';

    return (
        <View style={[s.driverRow, d.inPit && { opacity: 0.4 }]}>
            <View style={[s.teamBar, { backgroundColor: d.teamColor }]} />
            <Text style={s.dPos}>{d.position}</Text>
            <Text style={[s.dCode, { color: d.teamColor }]}>{d.broadcastName}</Text>

            {/* Tire */}
            <View style={[s.tireDot, { backgroundColor: tireC }]}>
                <Text style={{ color: d.tireCompound === 'HARD' ? '#000' : '#fff', fontSize: 6, fontWeight: '900' }}>{tireL}</Text>
            </View>
            <Text style={s.tireLaps}>{d.tireLaps}L</Text>

            {/* Speed */}
            <Text style={s.dSpeed}>{d.speed > 0 ? `${d.speed}` : 'DRS'}</Text>

            {/* Pits */}
            <Text style={s.dPits}>{d.inPit ? 'IN PIT' : `${d.pitCount} PIT`}</Text>

            {/* Interval */}
            <Text style={s.dInt}>{d.position === 1 ? '' : d.interval || d.gapToLeader || ''}</Text>

            {/* Lap Time */}
            <Text style={[s.dLap, { color: lapColor }]}>{d.bestLapTime || d.lastLapTime || ''}</Text>

            {/* Sectors */}
            <View style={s.sectorRow}>
                {[0, 1, 2].map(i => {
                    const sec = d.sectors[i];
                    const c = !sec?.time ? '#333' : sec.overallBest ? PURPLE : sec.personalBest ? GREEN : YELLOW;
                    return <View key={i} style={[s.sectorDot, { backgroundColor: c }]} />;
                })}
            </View>
        </View>
    );
}

// ─── Circuit Map ──────────────────────────────────────────────────────────────
function CircuitMap({ drivers, circuitPath, size = 220 }: { drivers: F1Driver[]; circuitPath: { x: number; y: number }[]; size?: number }) {
    if (!circuitPath.length) {
        return (
            <View style={{ width: size, height: size * 0.75, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD2, borderRadius: 12 }}>
                <Map color={DIM} size={28} />
                <Text style={{ color: DIM, fontSize: 10, marginTop: 6 }}>Circuito no disponible</Text>
            </View>
        );
    }

    const w = size;
    const h = size * 0.75;
    const pathStr = circuitPath.map(p => `${(p.x * w).toFixed(1)},${(p.y * h).toFixed(1)}`).join(' ');

    return (
        <Svg width={w} height={h}>
            <Polyline points={pathStr} stroke="rgba(255,255,255,0.5)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {drivers.slice(0, 20).filter(d => d.x !== 0.5 && d.y !== 0.5).map(d => {
                const cx = d.x * w;
                const cy = d.y * h;
                return (
                    <React.Fragment key={d.racingNumber}>
                        <Circle cx={cx} cy={cy} r={6} fill={d.teamColor} opacity={0.9} />
                        <SvgText x={cx} y={cy - 9} textAnchor="middle" fontSize={7} fontWeight="bold" fill="#FFF">
                            {d.broadcastName}
                        </SvgText>
                    </React.Fragment>
                );
            })}
        </Svg>
    );
}

// ─── Map Full View (tab MAPA) ─────────────────────────────────────────────────
function MapFullView({ drivers, circuitPath, session, w, h }: any) {
    const mapW = Math.min(w * 0.6, 700);
    const mapH = Math.min(h * 0.7, 500);

    return (
        <View style={s.threeCol}>
            {/* Left: driver list */}
            <View style={[s.col1, { flex: 0.3 }]}>
                <Text style={s.colTitle}>POSICIONES EN PISTA</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                    {drivers.slice(0, 10).map((d: F1Driver) => (
                        <View key={d.racingNumber} style={s.mapDriverRow}>
                            <View style={[s.teamBar, { backgroundColor: d.teamColor }]} />
                            <Text style={s.dPos}>{d.position}</Text>
                            <Text style={[s.dCode, { color: d.teamColor }]}>{d.broadcastName}</Text>
                            {d.inPit && <View style={s.pitBadge}><Text style={s.pitText}>DRS</Text></View>}
                            <View style={{ flex: 1 }} />
                            <Text style={{ color: F1_RED, fontSize: 12, fontWeight: '700' }}>
                                {d.speed > 0 ? `${d.speed}` : ''} <Text style={{ color: DIM, fontSize: 9 }}>km/h</Text>
                            </Text>
                        </View>
                    ))}
                </ScrollView>
            </View>

            {/* Right: big map */}
            <View style={{ flex: 0.7, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                {session && (
                    <View style={{ marginBottom: 12, alignItems: 'center' }}>
                        <Text style={{ color: TEXT, fontSize: 16, fontWeight: '900' }}>
                            {session.circuitName} — {session.countryName}
                        </Text>
                    </View>
                )}
                <CircuitMap drivers={drivers} circuitPath={circuitPath} size={mapW} />
                {/* Legend */}
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                    {drivers.slice(0, 5).map((d: F1Driver) => (
                        <View key={d.racingNumber} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: d.teamColor }} />
                            <Text style={{ color: TEXT, fontSize: 9, fontWeight: '700' }}>{d.broadcastName}</Text>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

// ─── Radio View (tab RADIO) ───────────────────────────────────────────────────
function RadioView({ raceControl, teamRadios, drivers }: { raceControl: F1RaceControlMsg[]; teamRadios: F1TeamRadio[]; drivers: F1Driver[] }) {
    return (
        <View style={s.threeCol}>
            {/* Left: Race Control */}
            <View style={[s.col1, { flex: 0.5 }]}>
                <Text style={s.colTitle}>🏁 RACE CONTROL</Text>
                <Text style={{ color: DIM, fontSize: 9, paddingHorizontal: 12, marginBottom: 8 }}>REAL-TIME DATA FEED</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                    {raceControl.slice(0, 30).map((m, i) => {
                        const c = m.flag?.includes('YELLOW') ? YELLOW :
                            m.flag?.includes('RED') ? F1_RED :
                                m.flag?.includes('GREEN') ? GREEN : DIM;
                        return (
                            <View key={i} style={[s.rcItem, { borderLeftColor: c }]}>
                                {m.category && (
                                    <View style={[s.rcCatBadge, { backgroundColor: `${c}20` }]}>
                                        <Text style={[s.rcCatText, { color: c }]}>{m.category}</Text>
                                    </View>
                                )}
                                <Text style={s.rcMsg}>{m.message}</Text>
                                <Text style={s.rcTime}>{m.utcTime?.slice(11, 19)}</Text>
                            </View>
                        );
                    })}
                    {raceControl.length === 0 && (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <Radio color={DIM} size={24} />
                            <Text style={{ color: DIM, marginTop: 8, fontSize: 12 }}>Sin mensajes activos</Text>
                        </View>
                    )}
                </ScrollView>
            </View>

            {/* Right: Team Radios */}
            <View style={[s.col3, { flex: 0.5 }]}>
                <Text style={s.colTitle}>📻 COMUNICACIONES DE EQUIPO</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                    {teamRadios.length === 0 ? (
                        <View style={{ padding: 28, alignItems: 'center' }}>
                            <Headphones color={DIM} size={28} />
                            <Text style={{ color: DIM, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                                No hay comunicaciones de radio.{'\n'}
                                <Text style={{ fontSize: 10 }}>Las radios aparecen durante sesiones en vivo.</Text>
                            </Text>
                        </View>
                    ) : (
                        teamRadios.map((r, i) => {
                            const tc = getTeamColor(r.team);
                            return (
                                <View key={i} style={s.radioItem}>
                                    <View style={[s.teamBar, { backgroundColor: tc, height: '100%' }]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: tc, fontSize: 12, fontWeight: '900' }}>
                                            {r.driverName || `#${r.driverNumber}`}
                                        </Text>
                                        <Text style={{ color: DIM, fontSize: 9 }}>{r.team}</Text>
                                    </View>
                                    <Text style={{ color: DIM, fontSize: 9 }}>{r.timestamp?.slice(11, 19)}</Text>
                                </View>
                            );
                        })
                    )}
                </ScrollView>

                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: BORDER }}>
                    <Text style={s.colTitle}>📢 ÚLTIMOS EVENTOS</Text>
                    {raceControl.slice(0, 4).map((m, i) => (
                        <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, gap: 8, alignItems: 'center' }}>
                            <Text style={{ fontSize: 12 }}>{flagEmoji(m.flag)}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: TEXT, fontSize: 10, fontWeight: '700' }}>{m.message}</Text>
                                <Text style={{ color: DIM, fontSize: 8 }}>{m.utcTime?.slice(11, 19)}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

// ─── Offline Layout ───────────────────────────────────────────────────────────
function OfflineLayout({ nextSession, drivers }: { nextSession: F1NextSession | null; drivers: F1Driver[] }) {
    const cd = nextSession ? fmtCountdown(nextSession.countdownMs) : null;

    return (
        <View style={s.threeCol}>
            {/* Left: Last session results */}
            <View style={s.col1}>
                <Text style={s.colTitle}>📊 ÚLTIMA SESIÓN</Text>
                {drivers.length > 0 ? (
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Table header */}
                        <View style={s.offTableHeader}>
                            <Text style={[s.offTh, { width: 30 }]}>POS</Text>
                            <Text style={[s.offTh, { flex: 1 }]}>PILOTO</Text>
                            <Text style={[s.offTh, { width: 100 }]}>ESCUDERÍA</Text>
                            <Text style={[s.offTh, { width: 80, textAlign: 'right' }]}>TIEMPO</Text>
                        </View>
                        {drivers.map(d => (
                            <View key={d.racingNumber} style={s.offRow}>
                                <Text style={[s.offPos, d.position === 1 && { color: GOLD }]}>{d.position}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: TEXT, fontSize: 12, fontWeight: '700' }}>{d.fullName || d.broadcastName}</Text>
                                </View>
                                <Text style={{ color: DIM, fontSize: 10, width: 100 }}>{d.teamName}</Text>
                                <Text style={{ color: GOLD, fontSize: 11, fontWeight: '700', width: 80, textAlign: 'right' }}>
                                    {d.position === 1 ? d.bestLapTime : (d.interval || d.gapToLeader || '')}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                ) : (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                        <Calendar color={DIM} size={28} />
                        <Text style={{ color: DIM, marginTop: 8 }}>Cargando datos...</Text>
                    </View>
                )}
            </View>

            {/* Center: Countdown */}
            <View style={s.col2}>
                {nextSession ? (
                    <View style={{ alignItems: 'center', gap: 12 }}>
                        <View style={s.nextBadgeCenter}>
                            <Text style={s.nextBadgeTxt}>SIGUIENTE EVENTO</Text>
                        </View>
                        <Text style={{ color: TEXT, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
                            {nextSession.sessionName?.toUpperCase()}
                        </Text>
                        <Text style={{ color: DIM, fontSize: 12, textAlign: 'center' }}>
                            {nextSession.gpName}
                        </Text>

                        <Text style={{ color: DIM, fontSize: 11, marginTop: 12 }}>PRÓXIMA SESIÓN EN</Text>
                        {cd && (
                            <View style={s.countdownRow}>
                                {[
                                    { v: cd.d, l: 'DÍAS' }, { v: cd.h, l: 'HORAS' },
                                    { v: cd.m, l: 'MINS' }, { v: cd.s, l: 'SEGS' },
                                ].map(({ v, l }) => (
                                    <View key={l} style={s.countdownItem}>
                                        <Text style={s.countdownNum}>{String(v).padStart(2, '0')}</Text>
                                        <Text style={s.countdownLabel}>{l}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Calendar color={DIM} size={14} />
                            <Text style={{ color: DIM, fontSize: 11 }}>
                                {nextSession.startsAt.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
                                {' '}
                                {nextSession.startsAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                    </View>
                ) : (
                    <View style={{ alignItems: 'center' }}>
                        <ActivityIndicator color={GOLD} />
                        <Text style={{ color: DIM, marginTop: 8 }}>Cargando calendario...</Text>
                    </View>
                )}
            </View>

            {/* Right: Race Control + Insight */}
            <View style={s.col3}>
                <Text style={s.colTitle}>🏁 RACE CONTROL</Text>
                <View style={{ flex: 0.5, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <AlertTriangle color={DIM} size={24} />
                    <Text style={{ color: DIM, fontSize: 11, marginTop: 8, textAlign: 'center' }}>Sin mensajes activos</Text>
                </View>

                <View style={{ flex: 0.5, borderTopWidth: 1, borderTopColor: BORDER, padding: 12 }}>
                    <Text style={s.colTitle}>📈 TELEMETRY INSIGHT</Text>
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Activity color={DIM} size={28} />
                        <Text style={{ color: DIM, fontSize: 10, marginTop: 8, textAlign: 'center' }}>
                            Los datos de telemetría se activarán{'\n'}cuando haya una sesión en vivo.
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
}


// ═══ Styles ═══════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 14, paddingVertical: 8,
        backgroundColor: CARD,
        borderBottomWidth: 2, borderBottomColor: BORDER,
    },
    backBtn: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
    backBtnFocused: { backgroundColor: 'rgba(250,204,21,0.15)' },
    headerBrand: { color: GOLD, fontSize: 14, fontWeight: '900', letterSpacing: 2 },
    headerSep: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 4 },
    headerGp: { color: TEXT, fontSize: 12, fontWeight: '600', flex: 0, maxWidth: 300 },
    lapBox: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginRight: 8 },
    lapLabel: { color: DIM, fontSize: 8, letterSpacing: 1 },
    lapValue: { color: TEXT, fontSize: 16, fontWeight: '900' },
    liveBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 4,
        borderWidth: 1, borderRadius: 6,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3 },
    liveTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    nextBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    nextTxt: { color: DIM, fontSize: 10 },

    // Content
    content: { flex: 1 },
    loadingText: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 16 },

    // 3 columns
    threeCol: { flex: 1, flexDirection: 'row' },
    col1: { flex: 0.38, borderRightWidth: 1, borderRightColor: BORDER },
    col2: { flex: 0.3, alignItems: 'center', justifyContent: 'center', padding: 12 },
    col3: { flex: 0.32, borderLeftWidth: 1, borderLeftColor: BORDER },

    colTitle: { color: DIM, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, paddingHorizontal: 12, paddingVertical: 8 },

    // Driver row
    driverRow: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 6, paddingVertical: 5,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    teamBar: { width: 2, height: 24, borderRadius: 1 },
    dPos: { color: TEXT, fontWeight: '900', fontSize: 11, width: 16, textAlign: 'center' },
    dCode: { fontWeight: '900', fontSize: 10, width: 28 },
    tireDot: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    tireLaps: { color: DIM, fontSize: 8, width: 18 },
    dSpeed: { color: DIM, fontSize: 9, width: 32, textAlign: 'center' },
    dPits: { color: DIM, fontSize: 8, width: 36 },
    dInt: { color: DIM, fontSize: 9, width: 44, textAlign: 'right' },
    dLap: { fontSize: 10, fontWeight: '700', width: 56, textAlign: 'right' },
    sectorRow: { flexDirection: 'row', gap: 2, marginLeft: 4 },
    sectorDot: { width: 6, height: 6, borderRadius: 1 },

    // Map driver row
    mapDriverRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 8,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
    },

    // Track status
    trackStatusBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)',
        marginBottom: 12,
    },
    trackDot: { width: 6, height: 6, borderRadius: 3 },
    trackStatusText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },

    // Fastest lap
    flCard: {
        marginTop: 12, padding: 10, borderRadius: 8,
        backgroundColor: `${PURPLE}14`, borderWidth: 1, borderColor: `${PURPLE}40`,
        width: '100%',
    },
    flTitle: { color: PURPLE, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },

    // Race control
    rcItem: {
        borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 8,
        marginHorizontal: 8, marginBottom: 2,
    },
    rcCatBadge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 1, alignSelf: 'flex-start', marginBottom: 3 },
    rcCatText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
    rcMsg: { color: TEXT, fontSize: 10, fontWeight: '600' },
    rcTime: { color: DIM, fontSize: 8, marginTop: 2 },

    // Top speed
    topSpeedCard: {
        padding: 10, borderTopWidth: 1, borderTopColor: BORDER,
    },
    topSpeedTitle: { color: DIM, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
    topSpeedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
    topSpeedBar: { width: 2, height: 14, borderRadius: 1 },
    topSpeedVal: { color: GOLD, fontSize: 13, fontWeight: '900', flex: 1, textAlign: 'right' },

    // Radio
    radioItem: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },

    // Pit badge
    pitBadge: { backgroundColor: `${GREEN}20`, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
    pitText: { color: GREEN, fontSize: 7, fontWeight: '900' },

    // Offline
    offTableHeader: {
        flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6,
        borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD,
    },
    offTh: { color: DIM, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    offRow: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    offPos: { color: TEXT, fontWeight: '900', fontSize: 14, width: 30 },

    // Countdown
    nextBadgeCenter: { backgroundColor: `${GOLD}20`, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 4 },
    nextBadgeTxt: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    countdownRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    countdownItem: { alignItems: 'center' },
    countdownNum: { color: TEXT, fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] as any },
    countdownLabel: { color: DIM, fontSize: 8, letterSpacing: 1, marginTop: 2 },

    // Tab bar
    tabBar: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 6,
        backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER,
    },
    tabItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
    tabItemActive: { backgroundColor: `${GOLD}15`, borderWidth: 1, borderColor: `${GOLD}40` },
    tabItemFocused: { backgroundColor: `${GOLD}25` },
    tabLabel: { color: DIM, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    footerSrc: { color: 'rgba(255,255,255,0.15)', fontSize: 8, marginRight: 8 },
    footerBrand: { color: GOLD, fontSize: 14, fontWeight: '900', letterSpacing: 2 },
});
