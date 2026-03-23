/**
 * TvAgendaSection — Exactamente igual que la sección "Agenda del Día" de TvSportsScreen.
 * Usa featuredEvents del store, filtrados por fecha de hoy, igual que TvSportsScreen.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, Image, Modal } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from './TvFocusable';

// ─── Mismos tokens que TvSportsScreen ─────────────────────────────────────────
const ACCENT = '#6366f1';
const ACCENT_DIM = 'rgba(99,102,241,0.15)';
const ACCENT_GLOW = 'rgba(99,102,241,0.35)';
const BG_CARD = 'rgba(6,14,34,0.92)';
const BG_CARD_2 = 'rgba(12,20,44,0.95)';
const LIVE_RED = '#ef4444';
const LIVE_DIM = 'rgba(239,68,68,0.15)';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = '#94a3b8';
const TEXT_DIM = '#4B5563';
const BORDER_CARD = 'rgba(255,255,255,0.06)';

// ─── Mismos filtros de categoría que TvSportsScreen ───────────────────────────
const FILTER_CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'live', label: 'LIVE' },
    { id: 'futbol', label: 'Football' },
    { id: 'f1', label: 'Motorsport' },
    { id: 'nba', label: 'Basketball' },
    { id: 'tennis', label: 'Tennis' },
    { id: 'other', label: 'Other' },
];

function matchesCategory(event: any, catId: string): boolean {
    if (catId === 'all') return true;
    if (catId === 'live') return (event.status || '').toLowerCase().includes('vivo');
    const text = `${event.league} ${event.category} ${event.team1} ${event.team2}`.toLowerCase();
    if (catId === 'futbol') return text.includes('súper') || text.includes('super') || text.includes('liga') || text.includes('copa') || text.includes('champions') || text.includes('libertadores') || text.includes('sudamericana') || text.includes('premier') || text.includes('laliga') || text.includes('fútbol') || text.includes('futbol');
    if (catId === 'f1') return text.includes('f1') || text.includes('formula') || text.includes('motogp') || text.includes('wrc') || text.includes('gp ');
    if (catId === 'nba') return text.includes('nba') || text.includes('basket');
    if (catId === 'tennis') return text.includes('tenis') || text.includes('tennis') || text.includes('atp') || text.includes('wta');
    if (catId === 'other') return true;
    return false;
}

// ─── FilterPill — igual que TvSportsScreen ────────────────────────────────────
const FilterPill = React.memo(function FilterPill({ item, isActive, onPress }: { item: any; isActive: boolean; onPress: () => void }) {
    return (
        <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.08} style={{ borderRadius: 24, marginRight: 10 }}>
            {(focused: boolean) => (
                <View style={{
                    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 24,
                    backgroundColor: isActive ? ACCENT : focused ? ACCENT_DIM : 'rgba(255,255,255,0.05)',
                    borderWidth: 1.5, borderColor: isActive ? ACCENT : focused ? ACCENT : BORDER_CARD,
                }}>
                    <Text style={{ color: isActive ? '#fff' : focused ? ACCENT : TEXT_SECONDARY, fontSize: 13, fontWeight: isActive ? '800' : '600', letterSpacing: 0.3 }}>
                        {item.label}
                    </Text>
                </View>
            )}
        </TvFocusable>
    );
});

// ─── AgendaMatchCard — Rediseño Aura Cinematic (con logos de equipos) ─────────
const AgendaMatchCard = React.memo(function AgendaMatchCard({ event, onPress }: { event: any; onPress: () => void }) {
    const hasVideo = !!event.videoUrl;
    const isLive = (event.status || '').toLowerCase().includes('vivo');
    const serverCount = Array.isArray(event.servers) ? event.servers.length : 0;

    return (
        <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.05} style={{ borderRadius: 20, marginRight: 16 }} focusedStyle={{}}>
            {(focused: boolean) => (
                <View style={{
                    width: 260,
                    borderRadius: 20,
                    overflow: 'hidden',
                    borderWidth: focused ? 2 : 1,
                    borderColor: focused ? ACCENT : 'rgba(255,255,255,0.07)',
                    backgroundColor: focused ? 'rgba(18, 22, 40, 0.98)' : 'rgba(14, 17, 30, 0.95)',
                    elevation: focused ? 12 : 0,
                }}>
                    {/* Franja superior de color */}
                    <View style={{ height: 3, backgroundColor: isLive ? LIVE_RED : (focused ? ACCENT : 'rgba(99,102,241,0.4)') }} />

                    {/* Cabecera: hora + liga + estado */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
                    }}>
                        {/* Liga */}
                        <View style={{ flex: 1, marginRight: 8 }}>
                            <Text numberOfLines={1} style={{
                                color: focused ? ACCENT : TEXT_SECONDARY,
                                fontSize: 9, fontWeight: '900', letterSpacing: 1.5,
                                textTransform: 'uppercase',
                            }}>
                                {event.league || event.category || 'SPORT'}
                            </Text>
                        </View>

                        {/* Estado o hora */}
                        {isLive ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LIVE_DIM, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: LIVE_RED }}>
                                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: LIVE_RED }} />
                                <Text style={{ color: LIVE_RED, fontSize: 8, fontWeight: '900', letterSpacing: 1 }}>EN VIVO</Text>
                            </View>
                        ) : (
                            <View style={{ backgroundColor: focused ? ACCENT : 'rgba(99,102,241,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                                <Text style={{ color: focused ? '#fff' : ACCENT, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                                    {event.time || '--:--'}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Divisor sutil */}
                    <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 16 }} />

                    {/* Equipos — "Match Card" layout */}
                    <View style={{ padding: 16, paddingTop: 14 }}>
                        {/* Team 1 */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            {event.logo1 ? (
                                <Image source={{ uri: event.logo1 }} style={{ width: 38, height: 38, marginRight: 12 }} resizeMode="contain" />
                            ) : (
                                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENT_DIM, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '900' }}>{event.team1?.substring(0,2).toUpperCase()}</Text>
                                </View>
                            )}
                            <Text numberOfLines={1} style={{ color: focused ? TEXT_PRIMARY : '#e2e8f0', fontSize: 13, fontWeight: '800', flex: 1 }}>
                                {event.team1}
                            </Text>
                        </View>

                        {/* VS divider */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 }}>
                            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                            <Text style={{ color: TEXT_DIM, fontSize: 10, fontWeight: '900', letterSpacing: 2 }}>VS</Text>
                            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                        </View>

                        {/* Team 2 */}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {event.logo2 ? (
                                <Image source={{ uri: event.logo2 }} style={{ width: 38, height: 38, marginRight: 12 }} resizeMode="contain" />
                            ) : (
                                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENT_DIM, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '900' }}>{event.team2?.substring(0,2).toUpperCase()}</Text>
                                </View>
                            )}
                            <Text numberOfLines={1} style={{ color: focused ? TEXT_PRIMARY : '#e2e8f0', fontSize: 13, fontWeight: '800', flex: 1 }}>
                                {event.team2 || '—'}
                            </Text>
                        </View>
                    </View>

                    {/* Footer */}
                    {focused && hasVideo ? (
                        <View style={{ backgroundColor: ACCENT, paddingVertical: 11, alignItems: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' }}>WATCH NOW</Text>
                        </View>
                    ) : focused && !hasVideo ? (
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', paddingVertical: 10, alignItems: 'center' }}>
                            <Text style={{ color: TEXT_DIM, fontSize: 9, fontWeight: '700' }}>No disponible</Text>
                        </View>
                    ) : serverCount > 0 ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', gap: 6 }}>
                            <Text style={{ color: hasVideo ? ACCENT : TEXT_DIM, fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>
                                {hasVideo ? 'LIVE' : 'OFFLINE'}
                            </Text>
                            <Text style={{ color: TEXT_DIM, fontSize: 9 }}>·</Text>
                            <Text style={{ color: TEXT_DIM, fontSize: 9, fontWeight: '600' }}>
                                {serverCount} {serverCount === 1 ? 'servidor' : 'servidores'}
                            </Text>
                        </View>
                    ) : null}
                </View>
            )}
        </TvFocusable>
    );
});

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TvAgendaSection() {
    const navigation = useNavigation<any>();
    // Usa exactamente la misma fuente de datos que TvSportsScreen
    const { featuredEvents } = useAppStore();
    const [activeFilter, setActiveFilter] = useState('all');
    const [selectedEventModal, setSelectedEventModal] = useState<{ event: any; servers: any[] } | null>(null);

    // Misma lógica de filtro por fecha de hoy que TvSportsScreen
    const todayAgenda = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return featuredEvents
            .filter(e => e.date === today)
            .sort((a, b) => a.time.localeCompare(b.time));
    }, [featuredEvents]);

    const filtered = useMemo(() => todayAgenda.filter(e => matchesCategory(e, activeFilter)), [todayAgenda, activeFilter]);

    const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1);
    const liveCount = todayAgenda.filter(e => (e.status || '').toLowerCase().includes('vivo')).length;

    if (todayAgenda.length === 0) return null; // No mostrar si no hay eventos

    return (
        <View style={{ marginBottom: 44 }}>
            {/* Cabecera sección — igual que TvSportsScreen */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingLeft: 24, gap: 10 }}>

                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ color: TEXT_PRIMARY, fontSize: 20, fontWeight: '900', letterSpacing: 0.2 }}>
                            Agenda del Día
                        </Text>
                        {liveCount > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: LIVE_DIM, borderWidth: 1, borderColor: LIVE_RED, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4 }}>
                                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: LIVE_RED }} />
                                <Text style={{ color: LIVE_RED, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>
                                    {liveCount} EN VIVO
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={{ color: TEXT_SECONDARY, fontSize: 12, fontWeight: '600', marginTop: 1 }}>
                        {todayCapitalized} · {filtered.length} {filtered.length === 1 ? 'evento' : 'eventos'}
                    </Text>
                </View>
            </View>

            {/* Filtros de categoría */}
            <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={FILTER_CATEGORIES}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12 }}
                renderItem={({ item }) => (
                    <FilterPill item={item} isActive={activeFilter === item.id} onPress={() => setActiveFilter(item.id)} />
                )}
            />

            {/* Lista de eventos */}
            {filtered.length > 0 ? (
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={filtered}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
                    initialNumToRender={4}
                    maxToRenderPerBatch={4}
                    windowSize={3}
                    removeClippedSubviews={true}
                    renderItem={({ item }) => (
                        <AgendaMatchCard
                            event={item}
                            onPress={() => {
                                if (!item.videoUrl) return;
                                const servers = Array.isArray(item.servers)
                                    ? item.servers.map((url: string, i: number) => ({ name: `Servidor ${i + 1}`, url }))
                                    : [];
                                if (servers.length <= 1) {
                                    navigation.navigate('SportsPlayerTV', {
                                        item: {
                                            id: item.id,
                                            title: `${item.team1} vs ${item.team2}`,
                                            type: 'tv',
                                            videoUrl: item.videoUrl,
                                            servers,
                                            poster: item.logo1 || '',
                                            backdrop: item.logo1 || '',
                                            description: `${item.league} · ${item.time}`,
                                            genre: 'Deportes',
                                            year: 'LIVE',
                                            rating: '',
                                        },
                                    });
                                } else {
                                    setSelectedEventModal({ event: item, servers });
                                }
                            }}
                        />
                    )}
                />
            ) : (
                <View style={{ paddingLeft: 24, paddingVertical: 20 }}>
                    <Text style={{ color: TEXT_DIM, fontSize: 14, fontWeight: '600' }}>No hay eventos en esta categoría</Text>
                </View>
            )}

            {/* Modal de selección de servidor */}
            <Modal visible={!!selectedEventModal} transparent={true} animationType="fade" onRequestClose={() => setSelectedEventModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedEventModal && (
                        <View style={{ width: 620, backgroundColor: BG_CARD_2, borderRadius: 24, borderWidth: 1, borderColor: ACCENT_GLOW, overflow: 'hidden', elevation: 20, shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 30 }}>
                            <View style={{ padding: 24, backgroundColor: ACCENT_DIM, borderBottomWidth: 1, borderBottomColor: BORDER_CARD }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
                                    {selectedEventModal.event.logo1 && <Image source={{ uri: selectedEventModal.event.logo1 }} style={{ width: 56, height: 56 }} resizeMode="contain" />}
                                    <View style={{ alignItems: 'center' }}>
                                        <Text style={{ color: TEXT_PRIMARY, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>
                                            {selectedEventModal.event.team1} vs {selectedEventModal.event.team2}
                                        </Text>
                                        <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>
                                            {selectedEventModal.event.league} · {selectedEventModal.event.time}
                                        </Text>
                                    </View>
                                    {selectedEventModal.event.logo2 && <Image source={{ uri: selectedEventModal.event.logo2 }} style={{ width: 56, height: 56 }} resizeMode="contain" />}
                                </View>
                            </View>
                            <View style={{ padding: 24 }}>
                                <Text style={{ color: TEXT_SECONDARY, fontSize: 15, fontWeight: '600', marginBottom: 16, textAlign: 'center' }}>
                                    Seleccioná un servidor de transmisión
                                </Text>
                                <FlatList
                                    data={selectedEventModal.servers}
                                    keyExtractor={(_, index) => index.toString()}
                                    showsVerticalScrollIndicator={false}
                                    renderItem={({ item }) => (
                                        <TvFocusable
                                            onPress={() => {
                                                const event = selectedEventModal.event;
                                                setSelectedEventModal(null);
                                                navigation.navigate('SportsPlayerTV', {
                                                    item: {
                                                        id: event.id,
                                                        title: `${event.team1} vs ${event.team2} (${item.name})`,
                                                        type: 'tv',
                                                        videoUrl: item.url,
                                                        servers: selectedEventModal.servers,
                                                        poster: event.logo1 || '',
                                                        backdrop: event.logo1 || '',
                                                        description: `${event.league} · ${event.time}`,
                                                        genre: 'Deportes',
                                                        year: 'LIVE',
                                                        rating: '',
                                                    },
                                                });
                                            }}
                                            borderWidth={0} scaleTo={1.03} style={{ borderRadius: 12, marginBottom: 10 }}
                                        >
                                            {(focused: boolean) => (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, backgroundColor: focused ? ACCENT : 'rgba(255,255,255,0.05)', borderWidth: 1.5, borderColor: focused ? 'rgba(255,255,255,0.3)' : BORDER_CARD }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                        <Text style={{ color: focused ? '#fff' : ACCENT, fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>STREAM</Text>
                                                        <Text style={{ color: focused ? '#fff' : TEXT_PRIMARY, fontSize: 16, fontWeight: '800' }}>{item.name}</Text>
                                                    </View>
                                                </View>
                                            )}
                                        </TvFocusable>
                                    )}
                                />
                                <TvFocusable onPress={() => setSelectedEventModal(null)} borderWidth={0} scaleTo={1.05} style={{ marginTop: 8, borderRadius: 12 }}>
                                    {(focused: boolean) => (
                                        <View style={{ padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: focused ? LIVE_DIM : 'transparent', borderWidth: 1.5, borderColor: focused ? LIVE_RED : BORDER_CARD }}>
                                            <Text style={{ color: focused ? LIVE_RED : TEXT_DIM, fontSize: 14, fontWeight: '700' }}>Cancelar</Text>
                                        </View>
                                    )}
                                </TvFocusable>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
        </View>
    );
}
