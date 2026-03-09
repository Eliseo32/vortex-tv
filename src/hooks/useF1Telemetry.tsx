/**
 * useF1Telemetry — F1 Live Bridge
 *
 * Arquitectura:
 *   ┌─ WebView oculto carga f1telemetry.com ──┐
 *   │  JS inyectado intercepta WebSocket       │
 *   │  SignalR → postMessage → RN              │
 *   └──────────────────────────────────────────┘
 *
 * Datos en vivo: DriverList, TimingData, TimingAppData, SessionInfo,
 *   RaceControlMessages, Position.z, CarData, TeamRadio
 * Datos offline: api.f1telemetry.com/upcoming + /calendar
 * Circuito: api.multiviewer.app/api/v1/circuits/{key}/{year}
 */

import React, { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

// ─── Team colors ──────────────────────────────────────────────────────────────
export const TEAM_COLORS: Record<string, string> = {
    'Red Bull Racing': '#3671C6', 'red bull racing': '#3671C6',
    'Ferrari': '#E8002D', 'ferrari': '#E8002D',
    'Mercedes': '#27F4D2', 'mercedes': '#27F4D2',
    'McLaren': '#FF8000', 'mclaren': '#FF8000',
    'Aston Martin': '#229971', 'aston martin': '#229971',
    'Alpine': '#FF87BC', 'alpine': '#FF87BC',
    'Williams': '#64C4FF', 'williams': '#64C4FF',
    'RB': '#6692FF', 'rb': '#6692FF',
    'Racing Bulls': '#6692FF', 'racing bulls': '#6692FF',
    'Kick Sauber': '#52E252', 'kick sauber': '#52E252',
    'Cadillac': '#1F6B44', 'cadillac': '#1F6B44',
    'Haas F1 Team': '#B6BABD', 'haas f1 team': '#B6BABD',
};
export function getTeamColor(name: string): string {
    return TEAM_COLORS[name] || TEAM_COLORS[name?.toLowerCase()] || '#888';
}

export const TIRE_COLORS: Record<string, string> = {
    SOFT: '#E8002D', MEDIUM: '#FFD700', HARD: '#FFFFFF',
    INTERMEDIATE: '#39B54A', WET: '#0067FF', UNKNOWN: '#555',
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface F1Sector {
    time: string;
    personalBest: boolean;
    overallBest: boolean;
}

export interface F1Driver {
    position: number;
    racingNumber: string;
    broadcastName: string;
    fullName: string;
    teamName: string;
    teamColor: string;
    gapToLeader: string;
    interval: string;
    lastLapTime: string;
    bestLapTime: string;
    lastLapPersonalBest: boolean;
    lastLapOverallBest: boolean;
    sectors: F1Sector[];
    tireCompound: string;
    tireLaps: number;
    inPit: boolean;
    pitCount: number;
    drsActive: boolean;
    speed: number;
    x: number;
    y: number;
}

export interface F1Session {
    name: string;
    localizedName: string;
    circuitName: string;
    countryName: string;
    countryCode: string;
    gp: string;
    totalLaps: number;
    currentLap: number;
    flag: string;
    isLive: boolean;
    isFinalised: boolean;
}

export interface F1RaceControlMsg {
    utcTime: string;
    message: string;
    flag?: string;
    category?: string;
}

export interface F1FastestLap {
    driver: string;
    team: string;
    teamColor: string;
    time: string;
    lap: number;
}

export interface F1CircuitPoint { x: number; y: number; }

export interface F1NextSession {
    gpName: string;
    circuitName: string;
    countryName: string;
    sessionName: string;
    sessionType: string;
    startsAt: Date;
    countdownMs: number;
}

export interface F1CalendarEvent {
    track: string;
    location: string;
    start: string;
    sessions: { type: string; start: string; end: string }[];
}

export interface F1TeamRadio {
    driverNumber: string;
    driverName: string;
    team: string;
    audioUrl: string;
    timestamp: string;
}

export interface F1SessionClock {
    remaining: string;  // "HH:MM:SS" or "MM:SS"
    remainingMs: number; // milliseconds
    paused: boolean;
    extrapolating: boolean;
    utc: string; // ISO timestamp when this was captured
}

export interface F1TelemetryState {
    isLive: boolean;
    isFinalised: boolean;
    isLoading: boolean;
    bridgeReady: boolean;
    error: string | null;
    session: F1Session | null;
    drivers: F1Driver[];
    raceControl: F1RaceControlMsg[];
    fastestLap: F1FastestLap | null;
    circuitPath: F1CircuitPoint[];
    lastUpdate: Date | null;
    nextSession: F1NextSession | null;
    calendar: F1CalendarEvent[];
    teamRadios: F1TeamRadio[];
    sessionClock: F1SessionClock | null;
}

const SESSION_TYPE_MAP: Record<string, string> = {
    Race: 'Carrera', Qualifying: 'Clasificación',
    'Sprint Race': 'Sprint', Sprint: 'Sprint',
    'Sprint Qualification': 'Clasif. Sprint', 'Sprint Qualifying': 'Clasif. Sprint',
    'Practice 1': 'Práctica 1', 'Practice 2': 'Práctica 2', 'Practice 3': 'Práctica 3',
};

// ─── Circuit name → MultiViewer circuit key mapping ───────────────────────────
const CIRCUIT_NAME_TO_KEY: Record<string, number> = {
    'melbourne': 10, 'albert park': 10, 'australia': 10,
    'silverstone': 2, 'great britain': 2,
    'hungaroring': 4, 'hungary': 4,
    'imola': 6,
    'spa': 7, 'spa-francorchamps': 7, 'belgium': 7,
    'austin': 9, 'cota': 9,
    'interlagos': 14, 'brazil': 14, 'são paulo': 14,
    'catalunya': 15, 'barcelona': 15, 'spain': 15,
    'spielberg': 19, 'austria': 19, 'red bull ring': 19,
    'monte carlo': 22, 'monaco': 22,
    'montreal': 23, 'canada': 23,
    'monza': 39, 'italy': 39,
    'suzuka': 46, 'japan': 46,
    'shanghai': 49, 'china': 49,
    'zandvoort': 55, 'netherlands': 55,
    'singapore': 61, 'marina bay': 61,
    'sakhir': 63, 'bahrain': 63,
    'mexico': 65, 'mexico city': 65,
    'yas marina': 70, 'abu dhabi': 70,
    'baku': 144, 'azerbaijan': 144,
    'jeddah': 149, 'saudi arabia': 149,
    'losail': 150, 'qatar': 150,
    'miami': 151,
    'las vegas': 152,
};

function guessCircuitKey(sessionInfo: any): number | null {
    // First try direct circuit key from sessionInfo
    const key = sessionInfo?.Meeting?.Circuit?.Key;
    if (key && typeof key === 'number') return key;

    // Fallback: try to match by name
    const names = [
        sessionInfo?.Meeting?.Circuit?.ShortName,
        sessionInfo?.Meeting?.Name,
        sessionInfo?.Meeting?.Country?.Name,
    ].filter(Boolean).map((n: string) => n.toLowerCase());

    for (const name of names) {
        for (const [pattern, circuitKey] of Object.entries(CIRCUIT_NAME_TO_KEY)) {
            if (name.includes(pattern)) return circuitKey;
        }
    }
    return null;
}

// ─── JS inyectado ANTES del contenido ─────────────────────────────────────────
const INTERCEPTOR_JS = `
(function() {
    var RN = window.ReactNativeWebView;
    function post(obj) { try { if (RN) RN.postMessage(JSON.stringify(obj)); } catch(e){} }

    // Proxy WebSocket
    var _WS = window.WebSocket;
    function WSProxy(url, protocols) {
        post({ type: 'ws_connect', url: url });
        var ws = protocols ? new _WS(url, protocols) : new _WS(url);
        ws.addEventListener('message', function(ev) {
            try {
                var raw = ev.data;
                if (typeof raw !== 'string' || raw === '{}') return;
                var data = JSON.parse(raw);
                // SignalR messages array
                if (data.M && data.M.length) {
                    for (var i = 0; i < data.M.length; i++) {
                        var msg = data.M[i];
                        if (!msg.A || !Array.isArray(msg.A)) continue;
                        post({ type: 'f1', dtype: msg.A[0], d: msg.A[1] });
                    }
                }
                // Initial snapshot
                if (data.R) {
                    post({ type: 'f1snapshot', d: data.R });
                }
            } catch(e) { post({ type: 'ws_error', msg: e.message }); }
        });
        ws.addEventListener('open', function() { post({ type: 'ws_open' }); });
        ws.addEventListener('close', function() { post({ type: 'ws_close' }); });
        ws.addEventListener('error', function() { post({ type: 'ws_error', msg: 'WebSocket error' }); });
        return ws;
    }
    WSProxy.prototype = _WS.prototype;
    WSProxy.CONNECTING = _WS.CONNECTING;
    WSProxy.OPEN = _WS.OPEN;
    WSProxy.CLOSING = _WS.CLOSING;
    WSProxy.CLOSED = _WS.CLOSED;
    window.WebSocket = WSProxy;
    post({ type: 'bridge_ready' });
})();
true;
`;

// ─── Deep merge (updates parciales de SignalR) ────────────────────────────────
function mergeDeep(target: any, source: any): void {
    if (!source) return;
    for (const k of Object.keys(source)) {
        if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
            if (!target[k]) target[k] = {};
            mergeDeep(target[k], source[k]);
        } else {
            target[k] = source[k];
        }
    }
}

// ─── Parsear sectores del TimingData ──────────────────────────────────────────
function parseSectors(timing: any): F1Sector[] {
    const sectors: F1Sector[] = [];
    const sd = timing?.Sectors;
    if (!sd) return sectors;
    for (const key of Object.keys(sd).sort()) {
        const s = sd[key];
        sectors.push({
            time: s?.Value || '',
            personalBest: !!s?.PersonalFastest,
            overallBest: !!s?.OverallFastest,
        });
    }
    return sectors;
}

// ─── Normalize raw circuit x/y arrays to 0→1 with padding ────────────────────
function normalizeCircuit(xArr: number[], yArr: number[]): F1CircuitPoint[] {
    if (!xArr?.length || !yArr?.length || xArr.length !== yArr.length) return [];
    const minX = Math.min(...xArr);
    const maxX = Math.max(...xArr);
    const minY = Math.min(...yArr);
    const maxY = Math.max(...yArr);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 0.05;
    return xArr.map((x, i) => ({
        x: pad + ((x - minX) / rangeX) * (1 - 2 * pad),
        y: pad + ((yArr[i] - minY) / rangeY) * (1 - 2 * pad),
    }));
}

// ─── Build drivers from accumulated refs ──────────────────────────────────────
function buildDriversFromRefs(
    driverList: Record<string, any>,
    timingData: Record<string, any>,
    timingAppData: Record<string, any>,
    carData: Record<string, any>,
    positionData: Record<string, any>,
): F1Driver[] {
    const rows: F1Driver[] = [];
    const nums = new Set([
        ...Object.keys(driverList),
        ...Object.keys(timingData),
    ]);

    nums.forEach(num => {
        const info = driverList[num] || {};
        const timing = timingData[num] || {};
        const app = timingAppData[num] || {};
        const car = carData[num] || {};
        const posInfo = positionData[num] || {};
        const pos = parseInt(timing.Position || '99');
        if (pos > 50) return;

        const team = info.TeamName || '';
        const lastStint = Array.isArray(app.Stints) ? app.Stints[app.Stints.length - 1] : null;

        rows.push({
            position: pos,
            racingNumber: num,
            broadcastName: info.Tla || `#${num}`,
            fullName: info.FullName || `${info.FirstName || ''} ${info.LastName || ''}`.trim(),
            teamName: team,
            teamColor: getTeamColor(team),
            gapToLeader: timing.GapToLeader || '',
            interval: timing.IntervalToPositionAhead?.Value || '',
            lastLapTime: timing.LastLapTime?.Value || '',
            bestLapTime: timing.BestLapTime?.Value || '',
            lastLapPersonalBest: !!timing.LastLapTime?.PersonalFastest,
            lastLapOverallBest: !!timing.LastLapTime?.OverallFastest,
            sectors: parseSectors(timing),
            tireCompound: lastStint?.Compound?.toUpperCase() || 'UNKNOWN',
            tireLaps: parseInt(lastStint?.TotalLaps || '0'),
            inPit: timing.InPit === true || timing.InPit === 'true',
            pitCount: parseInt(timing.NumberOfPitStops || app.NumberOfPitStops || '0'),
            drsActive: car.DRS === 14 || car.DRS === 12 || timing.DRS === 14,
            speed: parseInt(timing.Speeds?.ST?.Value || car.Speed || '0'),
            x: posInfo.X ?? 0.5,
            y: posInfo.Y ?? 0.5,
        });
    });

    return rows.sort((a, b) => a.position - b.position);
}

// ═══ Context para compartir el bridge entre screen y side-panel ═══════════════
const F1Ctx = createContext<F1TelemetryState | null>(null);

export function useF1Telemetry(_enabled = true): F1TelemetryState {
    const ctx = useContext(F1Ctx);
    if (ctx) return ctx;
    return {
        isLive: false, isFinalised: false, isLoading: true, bridgeReady: false,
        error: null, session: null, drivers: [], raceControl: [],
        fastestLap: null, circuitPath: [], lastUpdate: null,
        nextSession: null, calendar: [], teamRadios: [], sessionClock: null,
    };
}

// ═══ Bridge WebView Component ═════════════════════════════════════════════════
interface F1BridgeProps {
    children: (state: F1TelemetryState) => React.ReactNode;
}

export function F1BridgeProvider({ children }: F1BridgeProps) {
    const wvRef = useRef<WebView>(null);
    const countdownRef = useRef<any>(null);
    const nextRef = useRef<F1NextSession | null>(null);
    const fetchedCircuitKeyRef = useRef<number | null>(null);
    const clockTickerRef = useRef<any>(null);
    const sessionClockRef = useRef<F1SessionClock | null>(null);

    // Acumuladores de datos WebSocket
    const driverListRef = useRef<Record<string, any>>({});
    const timingRef = useRef<Record<string, any>>({});
    const timingAppRef = useRef<Record<string, any>>({});
    const carDataRef = useRef<Record<string, any>>({});
    const positionRef = useRef<Record<string, any>>({});
    const sessionRef = useRef<any>(null);
    const rcRef = useRef<F1RaceControlMsg[]>([]);
    const teamRadioRef = useRef<F1TeamRadio[]>([]);
    const circuitRef = useRef<F1CircuitPoint[]>([]);

    const [state, setState] = useState<F1TelemetryState>({
        isLive: false, isFinalised: false, isLoading: true, bridgeReady: false,
        error: null, session: null, drivers: [], raceControl: [],
        fastestLap: null, circuitPath: [], lastUpdate: null,
        nextSession: null, calendar: [], teamRadios: [], sessionClock: null,
    });

    // ── Fetch circuit geometry from MultiViewer API ──────────────────────────
    const fetchCircuitGeometry = useCallback(async (circuitKey: number) => {
        if (fetchedCircuitKeyRef.current === circuitKey) return;
        fetchedCircuitKeyRef.current = circuitKey;

        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= currentYear - 5; year--) {
            try {
                const res = await fetch(
                    `https://api.multiviewer.app/api/v1/circuits/${circuitKey}/${year}`,
                    { headers: { 'User-Agent': 'VortexTV/1.0' } }
                );
                if (!res.ok) continue;
                const data = await res.json();
                if (data?.x?.length && data?.y?.length) {
                    const normalized = normalizeCircuit(data.x, data.y);
                    circuitRef.current = normalized;
                    setState(s => ({ ...s, circuitPath: normalized }));
                    console.log(`[F1] Circuito cargado: ${data.circuitName || 'unknown'} (${year}) — ${normalized.length} puntos`);
                    return;
                }
            } catch { /* try next year */ }
        }
        console.log(`[F1] No se encontró geometría para circuitKey=${circuitKey}`);
    }, []);

    // ── Rebuild state from refs ──────────────────────────────────────────────
    const rebuild = useCallback(() => {
        const drivers = buildDriversFromRefs(
            driverListRef.current, timingRef.current,
            timingAppRef.current, carDataRef.current, positionRef.current,
        );

        let fastestLap: F1FastestLap | null = null;
        let bestTime = '';
        drivers.forEach(d => {
            if (d.lastLapOverallBest && d.lastLapTime) {
                if (!bestTime || d.lastLapTime < bestTime) {
                    bestTime = d.lastLapTime;
                    fastestLap = {
                        driver: d.broadcastName,
                        team: d.teamName,
                        teamColor: d.teamColor,
                        time: d.lastLapTime,
                        lap: 0,
                    };
                }
            }
        });

        const si = sessionRef.current;
        const session: F1Session | null = si ? {
            name: si.Name || '',
            localizedName: SESSION_TYPE_MAP[si.Name] || si.Name || '',
            circuitName: si.Meeting?.Circuit?.ShortName || si.Meeting?.Name || '',
            countryName: si.Meeting?.Country?.Name || '',
            countryCode: si.Meeting?.Country?.Code || '',
            gp: si.Meeting?.OfficialName || si.Meeting?.Name || '',
            totalLaps: si.TotalLaps || 0,
            currentLap: si.CurrentLap || 0,
            flag: si.TrackStatus || 'GREEN',
            isLive: true,
            isFinalised: si.Status === 'Finalised' || si.Status === 'Ends',
        } : null;

        // Trigger circuit fetch when we have session info
        if (si) {
            const circuitKey = guessCircuitKey(si);
            if (circuitKey) fetchCircuitGeometry(circuitKey);
        }

        setState(s => ({
            ...s,
            isLive: !!si,
            isFinalised: session?.isFinalised || false,
            isLoading: false,
            drivers,
            session,
            raceControl: [...rcRef.current],
            fastestLap,
            circuitPath: [...circuitRef.current],
            teamRadios: [...teamRadioRef.current],
            sessionClock: sessionClockRef.current,
            lastUpdate: new Date(),
        }));
    }, [fetchCircuitGeometry]);

    // ── ExtrapolatedClock parser ─────────────────────────────────────────────
    // Parses "HH:MM:SS" or "MM:SS" string to milliseconds
    const parseRemainingMs = (remaining: string): number => {
        if (!remaining) return 0;
        const parts = remaining.split(':').map(Number);
        if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
        return 0;
    };

    const applyExtrapolatedClock = useCallback((clockData: any) => {
        if (!clockData) return;
        const remaining = clockData.Remaining || clockData.remaining || '';
        const paused = clockData.Paused === true || clockData.paused === true;
        const extrapolating = clockData.Extrapolating === true || clockData.extrapolating === true;
        const utc = clockData.Utc || clockData.utc || new Date().toISOString();
        const remainingMs = parseRemainingMs(remaining);

        const clock: F1SessionClock = { remaining, remainingMs, paused, extrapolating, utc };
        sessionClockRef.current = clock;
        setState(s => ({ ...s, sessionClock: clock }));

        // Start real-time countdown ticker
        if (clockTickerRef.current) clearInterval(clockTickerRef.current);
        if (!paused && remainingMs > 0) {
            const startedAt = Date.now();
            const startMs = remainingMs;
            clockTickerRef.current = setInterval(() => {
                const elapsed = Date.now() - startedAt;
                const newMs = Math.max(0, startMs - elapsed);
                const totalSec = Math.floor(newMs / 1000);
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                const s2 = totalSec % 60;
                const newRemaining = h > 0
                    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`
                    : `${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`;
                const updated: F1SessionClock = { ...clock, remaining: newRemaining, remainingMs: newMs };
                sessionClockRef.current = updated;
                setState(s => ({ ...s, sessionClock: updated }));
                if (newMs <= 0) clearInterval(clockTickerRef.current);
            }, 1000);
        }
    }, []);

    // ── Handle WebView messages ──────────────────────────────────────────────
    const handleMessage = useCallback((ev: any) => {
        try {
            const msg = JSON.parse(ev.nativeEvent.data);

            switch (msg.type) {
                case 'bridge_ready':
                    setState(s => ({ ...s, bridgeReady: true }));
                    break;

                case 'ws_open':
                    setState(s => ({ ...s, isLoading: false }));
                    break;

                case 'ws_close':
                case 'ws_error':
                    break;

                case 'f1snapshot': {
                    const snap = msg.d;
                    if (!snap) break;
                    if (snap.DriverList) driverListRef.current = snap.DriverList;
                    if (snap.TimingData?.Lines) mergeDeep(timingRef.current, snap.TimingData.Lines);
                    if (snap.TimingAppData?.Lines) mergeDeep(timingAppRef.current, snap.TimingAppData.Lines);
                    if (snap.SessionInfo) sessionRef.current = snap.SessionInfo;
                    if (snap.TrackStatus) {
                        if (sessionRef.current) sessionRef.current.TrackStatus = snap.TrackStatus.Status;
                    }
                    if (snap.LapCount) {
                        if (sessionRef.current) {
                            sessionRef.current.CurrentLap = snap.LapCount.CurrentLap;
                            sessionRef.current.TotalLaps = snap.LapCount.TotalLaps;
                        }
                    }
                    if (snap.SessionStatus) {
                        if (sessionRef.current) sessionRef.current.Status = snap.SessionStatus.Status;
                    }
                    if (snap.ExtrapolatedClock) {
                        applyExtrapolatedClock(snap.ExtrapolatedClock);
                    }
                    if (snap.RaceControlMessages?.Messages) {
                        rcRef.current = Object.values(snap.RaceControlMessages.Messages)
                            .map((m: any) => ({
                                utcTime: m.Utc || '', message: m.Message || '',
                                flag: m.Flag, category: m.Category,
                            }))
                            .reverse()
                            .slice(0, 50);
                    }
                    rebuild();
                    break;
                }

                case 'f1':
                    switch (msg.dtype) {
                        case 'DriverList':
                            mergeDeep(driverListRef.current, msg.d);
                            rebuild();
                            break;
                        case 'TimingData':
                            if (msg.d?.Lines) { mergeDeep(timingRef.current, msg.d.Lines); rebuild(); }
                            break;
                        case 'TimingAppData':
                            if (msg.d?.Lines) { mergeDeep(timingAppRef.current, msg.d.Lines); rebuild(); }
                            break;
                        case 'CarData':
                            if (msg.d?.Entries) {
                                for (const entry of msg.d.Entries) {
                                    if (entry.Cars) {
                                        for (const [num, data] of Object.entries(entry.Cars as Record<string, any>)) {
                                            if (!carDataRef.current[num]) carDataRef.current[num] = {};
                                            mergeDeep(carDataRef.current[num], data.Channels || data);
                                        }
                                    }
                                }
                                rebuild();
                            }
                            break;
                        case 'Position.z':
                            if (msg.d?.Position) {
                                for (const entry of msg.d.Position) {
                                    if (entry.Entries) {
                                        for (const [num, data] of Object.entries(entry.Entries as Record<string, any>)) {
                                            positionRef.current[num] = {
                                                X: (data as any).X,
                                                Y: (data as any).Y,
                                            };
                                        }
                                    }
                                }
                                rebuild();
                            }
                            break;
                        case 'SessionInfo':
                            sessionRef.current = msg.d;
                            rebuild();
                            break;
                        case 'SessionStatus':
                            if (sessionRef.current && msg.d?.Status) {
                                sessionRef.current.Status = msg.d.Status;
                                rebuild();
                            }
                            break;
                        case 'TrackStatus':
                            if (sessionRef.current && msg.d?.Status) {
                                sessionRef.current.TrackStatus = msg.d.Status;
                                rebuild();
                            }
                            break;
                        case 'LapCount':
                            if (sessionRef.current) {
                                if (msg.d?.CurrentLap) sessionRef.current.CurrentLap = msg.d.CurrentLap;
                                if (msg.d?.TotalLaps) sessionRef.current.TotalLaps = msg.d.TotalLaps;
                                rebuild();
                            }
                            break;
                        case 'RaceControlMessages':
                            if (msg.d?.Messages) {
                                const newMsgs = Object.values(msg.d.Messages).map((m: any) => ({
                                    utcTime: m.Utc || '', message: m.Message || '',
                                    flag: m.Flag, category: m.Category,
                                }));
                                rcRef.current = [...newMsgs, ...rcRef.current].slice(0, 50);
                                rebuild();
                            }
                            break;
                        case 'TeamRadio':
                            if (msg.d?.Captures) {
                                const radios: F1TeamRadio[] = Object.values(msg.d.Captures).map((r: any) => ({
                                    driverNumber: r.RacingNumber || '',
                                    driverName: driverListRef.current[r.RacingNumber]?.Tla || '',
                                    team: driverListRef.current[r.RacingNumber]?.TeamName || '',
                                    audioUrl: r.Path || '',
                                    timestamp: r.Utc || '',
                                }));
                                teamRadioRef.current = [...radios, ...teamRadioRef.current].slice(0, 30);
                                rebuild();
                            }
                            break;
                        case 'ExtrapolatedClock':
                            applyExtrapolatedClock(msg.d);
                            break;
                    }
                    break;
            }
        } catch { /* parsing error, ignore */ }
    }, [rebuild, applyExtrapolatedClock]);

    // ── Fetch upcoming + calendar ────────────────────────────────────────────
    useEffect(() => {
        async function fetchOffline() {
            try {
                const [upRes, calRes] = await Promise.all([
                    fetch('https://api.f1telemetry.com/upcoming').then(r => r.json()).catch(() => null),
                    fetch('https://api.f1telemetry.com/calendar').then(r => r.json()).catch(() => null),
                ]);

                let nextSession: F1NextSession | null = null;
                if (upRes?.success && upRes?.nextEvent) {
                    const ev = upRes.nextEvent;
                    const dt = new Date(ev.start);
                    nextSession = {
                        gpName: ev.track || '',
                        circuitName: ev.location || '',
                        countryName: ev.location || '',
                        sessionName: SESSION_TYPE_MAP[ev.type] || ev.type || '',
                        sessionType: ev.type || '',
                        startsAt: dt,
                        countdownMs: Math.max(0, dt.getTime() - Date.now()),
                    };
                    nextRef.current = nextSession;
                }

                let calendar: F1CalendarEvent[] = [];
                if (calRes?.success && calRes?.groupsByLocation) {
                    calendar = calRes.groupsByLocation.map((g: any) => {
                        const sessions: { type: string; start: string; end: string }[] = [];
                        for (const key of ['p1', 'p2', 'p3', 'sq', 'sr', 'q', 'r']) {
                            if (g[key]) sessions.push({ type: g[key].type, start: g[key].start, end: g[key].end });
                        }
                        return { track: g.track, location: g.location, start: g.start, sessions };
                    });
                }

                setState(s => ({ ...s, nextSession, calendar }));
            } catch { /* ignore */ }
        }

        fetchOffline();
        const t = setInterval(fetchOffline, 60000);
        return () => clearInterval(t);
    }, []);

    // ── Countdown ticker ─────────────────────────────────────────────────────
    useEffect(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            if (!nextRef.current) return;
            const ms = Math.max(0, nextRef.current.startsAt.getTime() - Date.now());
            const updated = { ...nextRef.current, countdownMs: ms };
            nextRef.current = updated;
            setState(s => {
                if (!s.nextSession) return s;
                return { ...s, nextSession: updated };
            });
        }, 1000);
        return () => clearInterval(countdownRef.current);
    }, []);

    return (
        <F1Ctx.Provider value={state}>
            {/* WebView oculto — motor de datos */}
            <View style={{ height: 0, width: 0, overflow: 'hidden', position: 'absolute' }}>
                <WebView
                    ref={wvRef}
                    source={{ uri: 'https://www.f1telemetry.com/es/live-timing' }}
                    style={{ height: 1, width: 1, opacity: 0 }}
                    javaScriptEnabled
                    domStorageEnabled
                    injectedJavaScriptBeforeContentLoaded={INTERCEPTOR_JS}
                    onMessage={handleMessage}
                    onError={() => setState(s => ({ ...s, isLoading: false, error: 'WebView error' }))}
                    originWhitelist={['*']}
                    mixedContentMode="always"
                    mediaPlaybackRequiresUserAction={false}
                    userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                />
            </View>
            {children(state)}
        </F1Ctx.Provider>
    );
}
