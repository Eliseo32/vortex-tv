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
    { id: 'all', label: 'Todos' },
    { id: 'live', label: 'En Vivo' },
    { id: 'futbol', label: 'Fútbol' },
    { id: 'f1', label: 'Motor' },
    { id: 'nba', label: 'Básquet' },
    { id: 'tennis', label: 'Tenis' },
    { id: 'other', label: 'Otros' },
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

// ─── FilterPill — Rediseño Tipográfico ─────────────────────────────────────────
const FilterPill = React.memo(function FilterPill({ item, isActive, onPress }: { item: any; isActive: boolean; onPress: () => void }) {
    return (
        <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.1} style={{ borderRadius: 30, marginRight: 14 }}>
            {(focused: boolean) => (
                <View style={{
                    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 30,
                    backgroundColor: isActive ? 'rgba(0, 227, 253, 0.15)' : focused ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    borderWidth: 2, borderColor: isActive ? '#00e3fd' : focused ? '#fff' : 'rgba(255,255,255,0.05)',
                }}>
                    <Text style={{
                        color: isActive ? '#00e3fd' : focused ? '#fff' : '#aaaab7',
                        fontSize: 14, fontWeight: isActive ? '900' : '700', letterSpacing: 1, textTransform: 'uppercase'
                    }}>
                        {item.label}
                    </Text>
                </View>
            )}
        </TvFocusable>
    );
});

// ─── AgendaMatchCard — Rediseño Aura Cinematic (Pura Tipografía) ─────────────
const AgendaMatchCard = React.memo(function AgendaMatchCard({ event, onPress }: { event: any; onPress: () => void }) {
    const hasVideo = !!event.videoUrl;
    const isLive = (event.status || '').toLowerCase().includes('vivo');
    const serverCount = Array.isArray(event.servers) ? event.servers.length : 0;

    return (
        <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.05} style={{ borderRadius: 16, marginRight: 24 }}>
            {(focused: boolean) => (
                <View style={{
                    width: 360,
                    height: 200,
                    borderRadius: 16,
                    padding: 24,
                    overflow: 'hidden',
                    backgroundColor: focused ? 'rgba(28, 31, 43, 0.95)' : 'rgba(17, 19, 29, 0.85)',
                    borderWidth: 2,
                    borderColor: focused ? '#b6a0ff' : 'transparent', // Resplandor primary
                    elevation: focused ? 20 : 0,
                    justifyContent: 'space-between'
                }}>
                    {/* Ghost highlight en focus */}
                    {focused && (
                        <View style={{ position: 'absolute', top: -100, left: -50, width: 200, height: 200, backgroundColor: 'rgba(182, 160, 255, 0.15)', borderRadius: 100 }} />
                    )}

                    {/* Cabecera: Liga + Estado */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text numberOfLines={1} style={{
                            color: '#aaaab7', fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', flex: 1, marginRight: 12
                        }}>
                            {event.league || event.category || 'SPORT'}
                        </Text>
                        
                        <Text style={{ color: isLive ? '#ff4444' : '#00e3fd', fontSize: 13, fontWeight: '900', letterSpacing: 1 }}>{event.time}</Text>
                    </View>

                    {/* Centro: Enfrentamiento Tipográfico Masivo */}
                    <View style={{ flex: 1, justifyContent: 'center', marginVertical: 8 }}>
                        <Text numberOfLines={1} adjustsFontSizeToFit style={{
                            color: focused ? '#fff' : '#f0f0fd',
                            fontSize: 26, fontWeight: '900', lineHeight: 32, letterSpacing: -0.5,
                            textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4
                        }}>
                            {event.team1?.toUpperCase()}
                        </Text>
                        <Text style={{ color: '#464752', fontSize: 16, fontWeight: '900', marginVertical: 2, fontStyle: 'italic' }}>VS</Text>
                        <Text numberOfLines={1} adjustsFontSizeToFit style={{
                            color: focused ? '#fff' : '#f0f0fd',
                            fontSize: 26, fontWeight: '900', lineHeight: 32, letterSpacing: -0.5,
                            textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4
                        }}>
                            {event.team2?.toUpperCase() || '—'}
                        </Text>
                    </View>

                    {/* Footer: Servidores / Action */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <Text style={{ color: '#737580', fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
                            {hasVideo && focused ? 'PRESIONA PARA VER' : serverCount > 0 ? `${serverCount} SERVIDORES` : 'NO DISPONIBLE'}
                        </Text>
                        {focused && hasVideo && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#b6a0ff', shadowColor: '#b6a0ff', shadowRadius: 8, shadowOpacity: 1 }} />
                        )}
                    </View>
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
        // Usar hora de Argentina (UTC-3) para evitar que después de las 21:00 se pierdan eventos
        const now = new Date();
        const arDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        const today = arDate.toISOString().split('T')[0];
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
            {/* Cabecera sección — Titular Gigante */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 24, paddingLeft: 24, gap: 16 }}>
                <Text style={{ color: '#f0f0fd', fontSize: 42, fontWeight: '900', letterSpacing: -1, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}>
                    AGENDA DEL DÍA
                </Text>

                {liveCount > 0 && (
                    <View style={{ marginBottom: 8, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: 6, borderWidth: 1, borderColor: '#ff4444' }}>
                        <Text style={{ color: '#ff4444', fontSize: 13, fontWeight: '900', letterSpacing: 2 }}>{liveCount} EN VIVO</Text>
                    </View>
                )}
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

            {/* Modal de selección de servidor - Modal Cinematic */}
            <Modal visible={!!selectedEventModal} transparent={true} animationType="fade" onRequestClose={() => setSelectedEventModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(12,14,23,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedEventModal && (
                        <View style={{ width: 680, backgroundColor: '#11131d', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden', elevation: 20 }}>
                            {/* Modal Header Puramente Tipográfico */}
                            <View style={{ padding: 40, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', alignItems: 'center' }}>
                                <Text style={{ color: '#aaaab7', fontSize: 12, fontWeight: '800', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 12 }}>
                                    {selectedEventModal.event.league || 'TRANSMISIÓN'}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -1 }}>
                                    {selectedEventModal.event.team1}
                                </Text>
                                <Text style={{ color: '#464752', fontSize: 18, fontWeight: '900', marginVertical: 4, fontStyle: 'italic' }}>VS</Text>
                                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -1 }}>
                                    {selectedEventModal.event.team2}
                                </Text>
                            </View>
                            
                            <View style={{ padding: 32 }}>
                                <Text style={{ color: '#737580', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 20, textTransform: 'uppercase', textAlign: 'center' }}>
                                    SELECCIONAR SERVIDOR
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
                                                        poster: '',
                                                        backdrop: '',
                                                        description: `${event.league} · ${event.time}`,
                                                        genre: 'Deportes',
                                                        year: 'LIVE',
                                                        rating: '',
                                                    },
                                                });
                                            }}
                                            borderWidth={0} scaleTo={1.03} style={{ borderRadius: 12, marginBottom: 16 }}
                                        >
                                            {(focused: boolean) => (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 12, backgroundColor: focused ? '#b6a0ff' : 'rgba(255,255,255,0.03)', borderWidth: 1.5, borderColor: focused ? 'transparent' : 'rgba(255,255,255,0.05)' }}>
                                                    <Text style={{ color: focused ? '#000' : '#f0f0fd', fontSize: 16, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' }}>{item.name}</Text>
                                                </View>
                                            )}
                                        </TvFocusable>
                                    )}
                                />
                                <TvFocusable onPress={() => setSelectedEventModal(null)} borderWidth={0} scaleTo={1.05} style={{ marginTop: 12, borderRadius: 12 }}>
                                    {(focused: boolean) => (
                                        <View style={{ padding: 18, alignItems: 'center', borderRadius: 12, backgroundColor: focused ? 'rgba(255,255,255,0.1)' : 'transparent' }}>
                                            <Text style={{ color: focused ? '#fff' : '#aaaab7', fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>CANCELAR</Text>
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
