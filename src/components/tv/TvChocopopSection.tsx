/**
 * TvChocopopSection.tsx
 * Sección de eventos deportivos de ChocoPop Flow para el Home.
 *
 * Reemplaza TvAgendaSection en TvHomeScreen.
 * - Lee chocopopEvents del store (colección separada de "agenda")
 * - Muestra solo eventos live y soon (nunca ended)
 * - Ordena: live primero, luego soon por eventDate ASC
 * - Si no hay eventos → return null (no ocupa espacio)
 */
import React, { useState, useMemo } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import TvChocopopEventCard from './TvChocopopEventCard';
import TvChocopopEventModal from './TvChocopopEventModal';
import type { ChocopopEvent } from '../../store/useAppStore';

// ─── Diseño tokens (coherente con el home) ───────────────────────────────────
const LIVE_RED = '#ef4444';
const LIVE_DIM = 'rgba(239,68,68,0.12)';
const TEXT_PRIMARY = '#f0f0fd';
const TEXT_DIM = '#6b7280';
const ACCENT_GOLD = '#f59e0b';

export default function TvChocopopSection() {
    const { chocopopEvents } = useAppStore();
    const [selectedEvent, setSelectedEvent] = useState<ChocopopEvent | null>(null);

    // Filtrar y ordenar: live primero, luego soon por eventDate
    const activeEvents = useMemo(() => {
        const filtered = chocopopEvents.filter(e => e.status === 'live' || e.status === 'soon');
        return filtered.sort((a, b) => {
            // live siempre antes que soon
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            // Si mismo status, ordenar por eventDate ASC
            return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
        });
    }, [chocopopEvents]);

    // No renderizar nada si no hay eventos
    if (activeEvents.length === 0) return null;

    const liveCount = activeEvents.filter(e => e.status === 'live').length;

    return (
        <View style={{ marginBottom: 44 }}>
            {/* ── Header ── */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                marginBottom: 20,
                paddingLeft: 24,
                gap: 14,
            }}>
                <Text style={{
                    color: TEXT_PRIMARY,
                    fontSize: 36,
                    fontWeight: '900',
                    letterSpacing: -1,
                    textShadowColor: 'rgba(0,0,0,0.8)',
                    textShadowOffset: { width: 0, height: 3 },
                    textShadowRadius: 8,
                }}>
                    EVENTOS
                </Text>

                {liveCount > 0 && (
                    <View style={{
                        marginBottom: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: LIVE_DIM,
                        borderWidth: 1,
                        borderColor: LIVE_RED,
                        borderRadius: 6,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        gap: 6,
                    }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE_RED }} />
                        <Text style={{ color: LIVE_RED, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }}>
                            {liveCount} EN VIVO
                        </Text>
                    </View>
                )}

                <Text style={{
                    color: TEXT_DIM,
                    fontSize: 14,
                    fontWeight: '600',
                    marginBottom: 4,
                }}>
                    {activeEvents.length} {activeEvents.length === 1 ? 'evento' : 'eventos'}
                </Text>
            </View>

            {/* ── Lista horizontal de cards ── */}
            <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={activeEvents}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
                initialNumToRender={4}
                maxToRenderPerBatch={4}
                windowSize={3}
                removeClippedSubviews={true}
                renderItem={({ item }) => (
                    <TvChocopopEventCard
                        event={item}
                        onPress={() => setSelectedEvent(item)}
                    />
                )}
            />

            {/* ── Modal de detalle ── */}
            <TvChocopopEventModal
                event={selectedEvent}
                visible={!!selectedEvent}
                onClose={() => setSelectedEvent(null)}
            />
        </View>
    );
}
