/**
 * useF1Telemetry — Hook de telemetría F1 en tiempo real
 * Fuente: api.multiviewer.app (datos públicos de MultiViewer for F1)
 * Polling cada 3s cuando hay sesión activa
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Team colors ─────────────────────────────────────────────────────────────
export const TEAM_COLORS: Record<string, string> = {
    'Red Bull Racing': '#3671C6',
    'Ferrari': '#E8002D',
    'Mercedes': '#27F4D2',
    'McLaren': '#FF8000',
    'Aston Martin': '#229971',
    'Alpine': '#FF87BC',
    'Williams': '#64C4FF',
    'RB': '#6692FF',
    'Kick Sauber': '#52E252',
    'Haas F1 Team': '#B6BABD',
};

// ─── Tire colors ──────────────────────────────────────────────────────────────
export const TIRE_COLORS: Record<string, string> = {
    SOFT: '#E8002D',
    MEDIUM: '#FFD700',
    HARD: '#FFFFFF',
    INTERMEDIATE: '#39B54A',
    WET: '#0067FF',
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface F1Driver {
    position: number;
    racingNumber: string;
    broadcastName: string;       // "VER", "HAM", etc.
    fullName: string;
    teamName: string;
    teamColor: string;
    // Timing
    gapToLeader: string;
    interval: string;
    lastLapTime: string;
    bestLapTime: string;
    lastLapPersonalBest: boolean;
    lastLapOverallBest: boolean;
    // Sectors
    sectors: { time: string; overallBest: boolean; personalBest: boolean }[];
    // Tyre
    tireCompound: string;        // SOFT | MEDIUM | HARD | INTERMEDIATE | WET
    tireLaps: number;
    // Status
    inPit: boolean;
    pitCount: number;
    drsActive: boolean;
    speed: number;               // km/h en speed trap
    // Map position (normalizado 0-1)
    x: number;
    y: number;
}

export interface F1Session {
    name: string;               // "RACE", "QUALIFYING", "PRACTICE 1"
    localizedName: string;      // "Carrera", "Clasificación", "P1"
    circuitName: string;        // "Melbourne Grand Prix Circuit"
    countryName: string;        // "Australia"
    gp: string;                 // "Gran Premio de Australia"
    totalLaps: number;
    currentLap: number;
    sessionTime: string;        // Tiempo restante o transcurrido
    flag: string;               // "GREEN" | "YELLOW" | "RED" | "SC" | "VSC"
    isLive: boolean;
}

export interface F1RaceControlMsg {
    utcTime: string;
    message: string;
    flag?: string;              // "YELLOW" | "RED" | "GREEN" | "CHEQUERED"
    sector?: number;
}

export interface F1FastestLap {
    driver: string;
    team: string;
    teamColor: string;
    time: string;
    lap: number;
}

export interface F1CircuitPoint {
    x: number;
    y: number;
}

export interface F1TelemetryState {
    isLive: boolean;
    isLoading: boolean;
    error: string | null;
    session: F1Session | null;
    drivers: F1Driver[];
    raceControl: F1RaceControlMsg[];
    fastestLap: F1FastestLap | null;
    circuitPath: F1CircuitPoint[];  // Coordenadas del trazado del circuito
    lastUpdate: Date | null;
}

// ─── API ──────────────────────────────────────────────────────────────────────
const MV_BASE = 'https://api.multiviewer.app/api/v1';
const POLL_INTERVAL_MS = 3000;

const SESSION_TYPE_MAP: Record<string, string> = {
    'Race': 'Carrera',
    'Qualifying': 'Clasificación',
    'Sprint': 'Sprint',
    'Sprint Qualifying': 'Clasificación Sprint',
    'Practice 1': 'Práctica 1',
    'Practice 2': 'Práctica 2',
    'Practice 3': 'Práctica 3',
};

const FLAG_MAP: Record<string, string> = {
    'AllClear': 'GREEN',
    'Yellow': 'YELLOW',
    'DoubleYellow': 'YELLOW',
    'Red': 'RED',
    'SafetyCar': 'SC',
    'VirtualSafetyCar': 'VSC',
    'Chequered': 'CHEQUERED',
};

// Normalizar path del circuito a un bounding box de 0→1
function normalizeCircuit(points: { x: number; y: number }[]): F1CircuitPoint[] {
    if (!points.length) return [];
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    return points.map(p => ({
        x: (p.x - minX) / rangeX,
        y: (p.y - minY) / rangeY,
    }));
}

// Normalizar posición de un piloto al mismo sistema de coordenadas
function normalizePos(
    raw: { X: number; Y: number },
    minX: number, maxX: number,
    minY: number, maxY: number,
): { x: number; y: number } {
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    return {
        x: (raw.X - minX) / rangeX,
        y: (raw.Y - minY) / rangeY,
    };
}

async function fetchWithTimeout(url: string, ms = 5000): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useF1Telemetry(enabled = true): F1TelemetryState {
    const [state, setState] = useState<F1TelemetryState>({
        isLive: false,
        isLoading: true,
        error: null,
        session: null,
        drivers: [],
        raceControl: [],
        fastestLap: null,
        circuitPath: [],
        lastUpdate: null,
    });

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const circuitRawRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);
    const sessionKeyRef = useRef<string | null>(null);

    const fetchTelemetry = useCallback(async () => {
        try {
            // 1. Estado principal de live-timing
            const liveState = await fetchWithTimeout(`${MV_BASE}/live-timing/state`);
            if (!liveState || !liveState.SessionInfo) {
                setState(s => ({ ...s, isLive: false, isLoading: false }));
                return;
            }

            const si = liveState.SessionInfo;
            const sessionKey = `${si.Meeting?.Key}-${si.Name}`;
            const isLive = !!liveState.TimingData;

            // 2. Circuit map (solo si cambió de sesión o no tenemos datos)
            let circuitPath = state.circuitPath;
            if (sessionKey !== sessionKeyRef.current) {
                sessionKeyRef.current = sessionKey;
                try {
                    const circuitData = await fetchWithTimeout(
                        `${MV_BASE}/circuit-info/${si.Meeting?.Year || new Date().getFullYear()}`
                    );

                    // El campo CornerCoordinates o TrackSections tiene los puntos del trazado
                    const rawPoints: { X: number; Y: number }[] = circuitData?.TrackSections
                        ?.flatMap((s: any) => s.Points || []) || [];

                    if (rawPoints.length) {
                        const xs = rawPoints.map(p => p.X);
                        const ys = rawPoints.map(p => p.Y);
                        circuitRawRef.current = {
                            minX: Math.min(...xs), maxX: Math.max(...xs),
                            minY: Math.min(...ys), maxY: Math.max(...ys),
                        };
                        circuitPath = normalizeCircuit(rawPoints.map(p => ({ x: p.X, y: p.Y })));
                    }
                } catch (_) {
                    // Fallback sin mapa
                }
            }

            // 3. Posiciones de pilotos en pista (X, Y)
            const posData = liveState.Position?.Position?.[0]?.Entries || {};
            const bounds = circuitRawRef.current;

            // 4. Leaderboard
            const timingData = liveState.TimingData?.Lines || {};
            const timingAppData = liveState.TimingAppData?.Lines || {};
            const driverList = liveState.DriverList || {};

            const drivers: F1Driver[] = Object.entries(driverList).map(([num, info]: any) => {
                const timing = timingData[num] || {};
                const appData = timingAppData[num] || {};
                const pos = posData[num] || {};
                const teamColor = TEAM_COLORS[info.TeamName] || '#888888';

                const sectors = (timing.Sectors || []).map((s: any) => ({
                    time: s.Value || '',
                    overallBest: !!s.OverallFastest,
                    personalBest: !!s.PersonalFastest,
                }));

                let driverX = 0.5, driverY = 0.5;
                if (pos.X != null && pos.Y != null && bounds) {
                    const n = normalizePos(pos, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
                    driverX = n.x;
                    driverY = n.y;
                }

                return {
                    position: timing.Position || 0,
                    racingNumber: num,
                    broadcastName: info.Tla || num,       // 3-letter code
                    fullName: info.FullName || '',
                    teamName: info.TeamName || '',
                    teamColor,
                    gapToLeader: timing.GapToLeader || '',
                    interval: timing.IntervalToPositionAhead?.Value || '',
                    lastLapTime: timing.LastLapTime?.Value || '',
                    bestLapTime: timing.BestLapTime?.Value || '',
                    lastLapPersonalBest: !!timing.LastLapTime?.PersonalFastest,
                    lastLapOverallBest: !!timing.LastLapTime?.OverallFastest,
                    sectors,
                    tireCompound: appData.Stints?.[appData.Stints.length - 1]?.Compound || 'UNKNOWN',
                    tireLaps: appData.Stints?.[appData.Stints.length - 1]?.TotalLaps || 0,
                    inPit: !!timing.InPit,
                    pitCount: appData.NumberOfPitStops || 0,
                    drsActive: timing.DRS?.Status === '14' || timing.DRS?.Status === '12',
                    speed: timing.Speeds?.ST?.Value || 0,
                    x: driverX,
                    y: driverY,
                };
            }).sort((a, b) => (a.position || 99) - (b.position || 99));

            // 5. Race Control
            const rcMsgs: F1RaceControlMsg[] = (liveState.RaceControlMessages?.Messages || [])
                .slice(-20)
                .reverse()
                .map((m: any) => ({
                    utcTime: m.Utc || '',
                    message: m.Message || '',
                    flag: m.Flag || undefined,
                    sector: m.Sector || undefined,
                }));

            // 6. Fastest Lap
            const fastestEntry = Object.entries(timingData).find(
                ([_, t]: any) => t.BestLapTime?.OverallFastest
            );
            let fastestLap: F1FastestLap | null = null;
            if (fastestEntry) {
                const [num, t]: any = fastestEntry;
                const dl = driverList[num] || {};
                fastestLap = {
                    driver: dl.Tla || num,
                    team: dl.TeamName || '',
                    teamColor: TEAM_COLORS[dl.TeamName] || '#888',
                    time: t.BestLapTime?.Value || '',
                    lap: t.BestLapTime?.Lap || 0,
                };
            }

            // 7. Session info
            const sessionInfo: F1Session = {
                name: si.Name || '',
                localizedName: SESSION_TYPE_MAP[si.Name] || si.Name || '',
                circuitName: si.Meeting?.Circuit?.ShortName || '',
                countryName: si.Meeting?.Country?.Name || '',
                gp: `Gran Premio de ${si.Meeting?.Country?.Name || ''}`,
                totalLaps: liveState.LapCount?.TotalLaps || 0,
                currentLap: liveState.LapCount?.CurrentLap || 0,
                sessionTime: liveState.SessionData?.StatusSeries?.slice(-1)[0]?.SessionStatus || '',
                flag: FLAG_MAP[liveState.TrackStatus?.Status] || 'GREEN',
                isLive,
            };

            setState({
                isLive,
                isLoading: false,
                error: null,
                session: sessionInfo,
                drivers,
                raceControl: rcMsgs,
                fastestLap,
                circuitPath,
                lastUpdate: new Date(),
            });
        } catch (err: any) {
            setState(s => ({
                ...s,
                isLoading: false,
                error: err?.message === 'AbortError' ? 'Timeout' : (err?.message || 'Error'),
            }));
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        fetchTelemetry();
        intervalRef.current = setInterval(fetchTelemetry, POLL_INTERVAL_MS);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [enabled, fetchTelemetry]);

    return state;
}
