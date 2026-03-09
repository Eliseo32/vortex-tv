import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, Image, Dimensions, Animated,
    StyleSheet, BackHandler, Modal, TouchableOpacity,
} from 'react-native';
import { Play, Trophy, Tv, Calendar, Wifi, WifiOff, X, Server, Filter, Zap } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';
import F1HeroBanner from '../../components/tv/F1HeroBanner';

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

// ─── Design Tokens ────────────────────────────────────────────────────────────
const ACCENT = '#6366f1';          // Violeta/Índigo - color principal
const ACCENT_DIM = 'rgba(99,102,241,0.15)';
const ACCENT_GLOW = 'rgba(99,102,241,0.35)';
const BG_DARK = '#010a17';          // Fondo navy oscuro
const BG_CARD = 'rgba(6,14,34,0.92)';
const BG_CARD_2 = 'rgba(12,20,44,0.95)';
const LIVE_RED = '#ef4444';
const LIVE_DIM = 'rgba(239,68,68,0.15)';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = '#94a3b8';
const TEXT_DIM = '#4B5563';
const BORDER_SUBTLE = 'rgba(99,102,241,0.12)';
const BORDER_CARD = 'rgba(255,255,255,0.06)';

// ─── Categorías de filtro ─────────────────────────────────────────────────────
const FILTER_CATEGORIES = [
    { id: 'all', label: 'Todos', icon: '⚽' },
    { id: 'live', label: '🔴 En Vivo', icon: null },
    { id: 'futbol', label: 'Fútbol', icon: '⚽' },
    { id: 'f1', label: 'F1 & Motor', icon: '🏎️' },
    { id: 'nba', label: 'NBA', icon: '🏀' },
    { id: 'tennis', label: 'Tenis', icon: '🎾' },
    { id: 'other', label: 'Otros', icon: '🏆' },
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

// ─── Filter Pill ─────────────────────────────────────────────────────────────
function FilterPill({ item, isActive, onPress }: { item: any; isActive: boolean; onPress: () => void }) {
    return (
        <TvFocusable
            onPress={onPress}
            borderWidth={0}
            scaleTo={1.08}
            style={{ borderRadius: 24, marginRight: 10 }}
        >
            {(focused: boolean) => (
                <View style={{
                    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 24,
                    backgroundColor: isActive
                        ? ACCENT
                        : focused ? ACCENT_DIM : 'rgba(255,255,255,0.05)',
                    borderWidth: 1.5,
                    borderColor: isActive ? ACCENT : focused ? ACCENT : BORDER_CARD,
                }}>
                    <Text style={{
                        color: isActive ? '#fff' : focused ? ACCENT : TEXT_SECONDARY,
                        fontSize: 13, fontWeight: isActive ? '800' : '600',
                        letterSpacing: 0.3,
                    }}>
                        {item.label}
                    </Text>
                </View>
            )}
        </TvFocusable>
    );
}

// ─── Tarjeta de partido de la agenda ─────────────────────────────────────────
function AgendaMatchCard({ event, onPress }: { event: any; onPress: () => void }) {
    const hasVideo = !!event.videoUrl;
    const isLive = (event.status || '').toLowerCase().includes('vivo');
    const serverCount = Array.isArray(event.servers) ? event.servers.length : 0;

    return (
        <TvFocusable
            onPress={onPress}
            borderWidth={0}
            scaleTo={1.06}
            style={{ borderRadius: 18, marginRight: 16 }}
            focusedStyle={{ backgroundColor: 'transparent' }}
        >
            {(focused: boolean) => (
                <View style={{
                    width: 230,
                    borderRadius: 18,
                    overflow: 'hidden',
                    borderWidth: focused ? 2 : 1,
                    borderColor: focused ? ACCENT : BORDER_CARD,
                    backgroundColor: focused ? BG_CARD_2 : BG_CARD,
                    shadowColor: focused ? ACCENT : 'transparent',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: focused ? 0.5 : 0,
                    shadowRadius: 12,
                    elevation: focused ? 8 : 0,
                }}>
                    {/* Cabecera: hora + estado */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        padding: 12, paddingBottom: 8,
                        backgroundColor: focused ? ACCENT_DIM : 'rgba(255,255,255,0.03)',
                        borderBottomWidth: 1, borderBottomColor: BORDER_CARD,
                    }}>
                        <View style={{
                            backgroundColor: focused ? ACCENT : 'rgba(99,102,241,0.2)',
                            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                        }}>
                            <Text style={{ color: focused ? '#fff' : ACCENT, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>
                                {event.time || '--:--'}
                            </Text>
                        </View>

                        {isLive ? (
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: 5,
                                backgroundColor: LIVE_DIM, paddingHorizontal: 8, paddingVertical: 3,
                                borderRadius: 6, borderWidth: 1, borderColor: LIVE_RED
                            }}>
                                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: LIVE_RED }} />
                                <Text style={{ color: LIVE_RED, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>EN VIVO</Text>
                            </View>
                        ) : (
                            <Text style={{ color: TEXT_DIM, fontSize: 10, fontWeight: '600' }}>
                                {event.sportIcon || '🏆'}
                            </Text>
                        )}
                    </View>

                    {/* Liga */}
                    <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                        <Text numberOfLines={1} style={{ color: TEXT_SECONDARY, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                            {event.league || event.category || 'Deporte'}
                        </Text>
                    </View>

                    {/* Equipos */}
                    <View style={{ padding: 12, paddingTop: 8, alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                            {/* Equipo 1 */}
                            <View style={{ alignItems: 'center', flex: 1, gap: 5 }}>
                                {event.logo1 ? (
                                    <Image source={{ uri: event.logo1 }} style={{ width: 44, height: 44 }} resizeMode="contain" />
                                ) : (
                                    <View style={{
                                        width: 44, height: 44, borderRadius: 22,
                                        backgroundColor: ACCENT_DIM, alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Trophy color={ACCENT} size={18} strokeWidth={1.5} />
                                    </View>
                                )}
                                <Text numberOfLines={2} style={{
                                    color: focused ? TEXT_PRIMARY : '#D1D5DB',
                                    fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 13
                                }}>
                                    {event.team1}
                                </Text>
                            </View>

                            {/* VS */}
                            <View style={{ paddingHorizontal: 6 }}>
                                <Text style={{ color: TEXT_DIM, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>VS</Text>
                            </View>

                            {/* Equipo 2 */}
                            <View style={{ alignItems: 'center', flex: 1, gap: 5 }}>
                                {event.logo2 ? (
                                    <Image source={{ uri: event.logo2 }} style={{ width: 44, height: 44 }} resizeMode="contain" />
                                ) : (
                                    <View style={{
                                        width: 44, height: 44, borderRadius: 22,
                                        backgroundColor: ACCENT_DIM, alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Trophy color={ACCENT} size={18} strokeWidth={1.5} />
                                    </View>
                                )}
                                <Text numberOfLines={2} style={{
                                    color: focused ? TEXT_PRIMARY : '#D1D5DB',
                                    fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 13
                                }}>
                                    {event.team2 || '—'}
                                </Text>
                            </View>
                        </View>

                        {/* Servidores disponibles */}
                        {serverCount > 0 && (
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                marginTop: 10, backgroundColor: 'rgba(255,255,255,0.04)',
                                borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, gap: 5, alignSelf: 'center'
                            }}>
                                {hasVideo ? <Wifi color={ACCENT} size={10} /> : <WifiOff color={TEXT_DIM} size={10} />}
                                <Text style={{ color: hasVideo ? ACCENT : TEXT_DIM, fontSize: 9, fontWeight: '700' }}>
                                    {serverCount} {serverCount === 1 ? 'servidor' : 'servidores'}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Footer CTA */}
                    {focused && hasVideo && (
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            paddingVertical: 10, backgroundColor: ACCENT, gap: 6
                        }}>
                            <Play color="#fff" size={12} fill="#fff" />
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' }}>
                                Ver en vivo
                            </Text>
                        </View>
                    )}
                    {focused && !hasVideo && (
                        <View style={{ alignItems: 'center', paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                            <Text style={{ color: TEXT_DIM, fontSize: 9, fontWeight: '700' }}>No disponible</Text>
                        </View>
                    )}
                </View>
            )}
        </TvFocusable>
    );
}

// ─── Sección de Agenda del Día ────────────────────────────────────────────────
function AgendaSection({ events, activeFilter, onFilterChange }: {
    events: any[];
    activeFilter: string;
    onFilterChange: (id: string) => void;
}) {
    const navigation = useNavigation<any>();

    const filtered = useMemo(() => {
        return events.filter(e => matchesCategory(e, activeFilter));
    }, [events, activeFilter]);

    const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1);
    const liveCount = events.filter(e => (e.status || '').toLowerCase().includes('vivo')).length;

    return (
        <View style={{ marginBottom: 36 }}>
            {/* Cabecera sección */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingLeft: 68, gap: 10 }}>
                <Calendar color={ACCENT} size={20} strokeWidth={2.5} />
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ color: TEXT_PRIMARY, fontSize: 20, fontWeight: '900', letterSpacing: 0.2 }}>
                            Agenda del Día
                        </Text>
                        {liveCount > 0 && (
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                backgroundColor: LIVE_DIM, borderWidth: 1, borderColor: LIVE_RED,
                                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4
                            }}>
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



            {/* Filtro de categoría */}
            <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={FILTER_CATEGORIES}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: 64, paddingBottom: 12 }}
                renderItem={({ item }) => (
                    <FilterPill
                        item={item}
                        isActive={activeFilter === item.id}
                        onPress={() => onFilterChange(item.id)}
                    />
                )}
            />

            {/* Lista de eventos */}
            {filtered.length > 0 ? (
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={filtered}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 64, paddingBottom: 8 }}
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
                                    if ((global as any).openServerModal) {
                                        (global as any).openServerModal(item, servers);
                                    }
                                }
                            }}
                        />
                    )}
                />
            ) : (
                <View style={{ paddingLeft: 64, paddingVertical: 20 }}>
                    <Text style={{ color: TEXT_DIM, fontSize: 14, fontWeight: '600' }}>
                        No hay eventos en esta categoría
                    </Text>
                </View>
            )}
        </View>
    );
}

// ─── Tarjeta de Canal / Carpeta ───────────────────────────────────────────────
function ChannelCard({ item, onPress }: { item: any; onPress: () => void }) {
    return (
        <TvFocusable
            onPress={onPress}
            borderWidth={0}
            scaleTo={1.08}
            style={{ borderRadius: 14, marginRight: 14 }}
            focusedStyle={{ backgroundColor: 'transparent' }}
        >
            {(focused: boolean) => (
                <View style={{
                    width: 160, borderRadius: 14, overflow: 'hidden',
                    borderWidth: focused ? 2 : 1,
                    borderColor: focused ? ACCENT : BORDER_CARD,
                    backgroundColor: focused ? BG_CARD_2 : BG_CARD,
                    shadowColor: focused ? ACCENT : 'transparent',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: focused ? 0.4 : 0,
                    shadowRadius: 10,
                    elevation: focused ? 6 : 0,
                }}>
                    {/* Poster / Logo */}
                    <View style={{ width: '100%', height: 100, backgroundColor: 'rgba(10,18,40,0.95)' }}>
                        {item.poster || item.logo ? (
                            <Image
                                source={{ uri: item.poster || item.logo }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="contain"
                            />
                        ) : (
                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                <Tv color={ACCENT} size={32} strokeWidth={1.5} />
                            </View>
                        )}
                        {focused && (
                            <View style={{
                                ...StyleSheet.absoluteFillObject,
                                backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Play color="#fff" size={26} fill="#fff" />
                            </View>
                        )}
                    </View>

                    {/* Nombre */}
                    <View style={{ padding: 10, backgroundColor: focused ? ACCENT_DIM : 'transparent' }}>
                        <Text numberOfLines={1} style={{
                            color: focused ? ACCENT : TEXT_PRIMARY,
                            fontSize: 12, fontWeight: '800', letterSpacing: 0.2,
                        }}>
                            {item.title}
                        </Text>
                        {item.genre && (
                            <Text numberOfLines={1} style={{ color: TEXT_DIM, fontSize: 10, marginTop: 2 }}>
                                {item.genre}
                            </Text>
                        )}
                    </View>
                </View>
            )}
        </TvFocusable>
    );
}

// ─── Pantalla principal de Deportes ──────────────────────────────────────────
export default function TvSportsScreen() {
    const navigation = useNavigation<any>();
    const { cloudContent, featuredEvents, channelFolders } = useAppStore();

    const flatListRef = useRef<FlatList>(null);
    const scrollOffset = useRef(0);
    const [activeFilter, setActiveFilter] = useState('all');

    // ─── Modal de Servidores ────────────────────────────────────────────────
    const [selectedEventModal, setSelectedEventModal] = useState<{ event: any, servers: any[] } | null>(null);

    useEffect(() => {
        (global as any).openServerModal = (event: any, servers: any[]) => {
            setSelectedEventModal({ event, servers });
        };
        return () => { delete (global as any).openServerModal; };
    }, []);

    // ─── Canales de deporte: type 'tv' + genre 'Deportes' ──────────────────
    const sportChannels = useMemo(
        () => cloudContent.filter(item => item.type === 'tv' && item.genre === 'Deportes'),
        [cloudContent],
    );

    // ─── Agenda del día desde Firestore ─────────────────────────────────────
    const todayAgenda = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return featuredEvents
            .filter(e => e.date === today)
            .sort((a, b) => a.time.localeCompare(b.time));
    }, [featuredEvents]);

    // ─── Secciones de canales (cloudContent sport + channelFolders sport) ──
    const SPORT_KEYWORDS = ['deport', 'espn', 'fox sport', 'tyc', 'fútbol', 'futbol', 'tnt sport', 'dazn', 'bein', 'star+', 'win sport', 'directv sport', 'telefe', 'sport', 'gol', 'nfl', 'nba', 'ufc', 'f1', 'racing', 'tenis', 'premier', 'liga', 'copa', 'champions', 'formula'];

    const groupedChannels = useMemo(() => {
        const groups: Record<string, typeof sportChannels> = {};
        sportChannels.forEach(item => {
            const key = item.genre || item.type || 'Otros';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return Object.entries(groups).map(([title, items]) => ({ title, items }));
    }, [sportChannels]);

    const sportFolderSections = useMemo(() => {
        return channelFolders
            .filter(folder => {
                const lower = folder.name.toLowerCase();
                return SPORT_KEYWORDS.some(kw => lower.includes(kw));
            })
            .map(folder => ({
                title: folder.name,
                items: (folder.options || []).map((opt: any, i: number) => ({
                    id: `${folder.id}-opt-${i}`,
                    title: opt.name,
                    type: 'tv',
                    genre: folder.name,
                    poster: folder.logo || '',
                    backdrop: folder.logo || '',
                    videoUrl: opt.iframe,
                    description: `${folder.name} en directo`,
                    year: 'LIVE',
                    rating: '',
                })),
            }))
            .filter(s => s.items.length > 0);
    }, [channelFolders]);

    const allSections = useMemo(() => [...groupedChannels, ...sportFolderSections], [groupedChannels, sportFolderSections]);

    // ─── Botón Atrás ──────────────────────────────────────────────────────
    useFocusEffect(
        React.useCallback(() => {
            const onBackPress = () => {
                if (scrollOffset.current > 100) {
                    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                    return true;
                }
                return false;
            };
            const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => backHandler.remove();
        }, []),
    );

    const handleScroll = (event: any) => { scrollOffset.current = event.nativeEvent.contentOffset.y; };

    // ─── Estado vacío ─────────────────────────────────────────────────────
    if (sportChannels.length === 0 && todayAgenda.length === 0 && allSections.length === 0) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG_DARK }}>
                <Trophy color={ACCENT} size={64} strokeWidth={1.5} />
                <Text style={{ color: TEXT_PRIMARY, fontSize: 28, fontWeight: '900', marginTop: 24, letterSpacing: -0.5 }}>
                    Sin contenido deportivo
                </Text>
                <Text style={{ color: TEXT_SECONDARY, fontSize: 15, marginTop: 10, textAlign: 'center', maxWidth: 380 }}>
                    Ejecutá el workflow de canales o esperá la actualización de la agenda.
                </Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: BG_DARK }}>
            {/* Lista vertical principal */}
            <FlatList
                ref={flatListRef}
                data={allSections}
                keyExtractor={(_, idx) => idx.toString()}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingBottom: 200, paddingTop: 120 }}
                initialNumToRender={3}
                windowSize={5}
                maxToRenderPerBatch={3}
                removeClippedSubviews={true}

                ListHeaderComponent={
                    <View>
                        {/* Título de la sección */}
                        <View style={{ marginBottom: 24, paddingLeft: 64, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={{
                                width: 44, height: 44, borderRadius: 12,
                                backgroundColor: ACCENT_DIM, alignItems: 'center', justifyContent: 'center',
                                borderWidth: 1, borderColor: ACCENT_GLOW
                            }}>
                                <Trophy color={ACCENT} size={22} strokeWidth={2} />
                            </View>
                            <View>
                                <Text style={{ color: TEXT_PRIMARY, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 }}>
                                    Deportes
                                </Text>
                                <Text style={{ color: TEXT_SECONDARY, fontSize: 12, fontWeight: '600', marginTop: 1 }}>
                                    Agenda en vivo y canales deportivos
                                </Text>
                            </View>
                        </View>

                        {/* ── BANNER F1 TELEMETRÍA ──────────────────────────── */}
                        <F1HeroBanner
                            onPress={() => navigation.navigate('F1TelemetryTV')}
                        />

                        {/* ── AGENDA DEL DÍA ─────────────────────────────── */}
                        {todayAgenda.length > 0 && (
                            <AgendaSection
                                events={todayAgenda}
                                activeFilter={activeFilter}
                                onFilterChange={setActiveFilter}
                            />
                        )}
                    </View>
                }

                renderItem={({ item: group }) => (
                    <View style={{ marginBottom: 32 }}>
                        {/* Título del grupo */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingLeft: 64 }}>
                            <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: ACCENT, marginRight: 10 }} />
                            <Text style={{ color: TEXT_PRIMARY, fontSize: 18, fontWeight: '900', letterSpacing: 0.3 }}>
                                {group.title}
                            </Text>
                            <Text style={{ color: TEXT_DIM, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
                                ({group.items.length})
                            </Text>
                        </View>

                        {/* Lista horizontal de canales */}
                        <FlatList
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            data={group.items}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ paddingHorizontal: 56, paddingBottom: 8 }}
                            initialNumToRender={5}
                            windowSize={3}
                            maxToRenderPerBatch={5}
                            removeClippedSubviews={true}
                            renderItem={({ item }) => (
                                <ChannelCard
                                    item={item}
                                    onPress={() => navigation.navigate('DetailTV', { item })}
                                />
                            )}
                        />
                    </View>
                )}
            />

            {/* ─── Modal de Selección de Servidor ─────────────────────── */}
            <Modal
                visible={!!selectedEventModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedEventModal(null)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedEventModal && (
                        <View style={{
                            width: 620, backgroundColor: BG_CARD_2, borderRadius: 24,
                            borderWidth: 1, borderColor: ACCENT_GLOW,
                            overflow: 'hidden', elevation: 20,
                            shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 30,
                        }}>
                            {/* Header del Modal */}
                            <View style={{ padding: 24, backgroundColor: ACCENT_DIM, borderBottomWidth: 1, borderBottomColor: BORDER_CARD }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
                                    {selectedEventModal.event.logo1 && (
                                        <Image source={{ uri: selectedEventModal.event.logo1 }}
                                            style={{ width: 56, height: 56 }} resizeMode="contain" />
                                    )}
                                    <View style={{ alignItems: 'center' }}>
                                        <Text style={{ color: TEXT_PRIMARY, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>
                                            {selectedEventModal.event.team1} vs {selectedEventModal.event.team2}
                                        </Text>
                                        <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>
                                            {selectedEventModal.event.league} · {selectedEventModal.event.time}
                                        </Text>
                                    </View>
                                    {selectedEventModal.event.logo2 && (
                                        <Image source={{ uri: selectedEventModal.event.logo2 }}
                                            style={{ width: 56, height: 56 }} resizeMode="contain" />
                                    )}
                                </View>
                            </View>

                            {/* Lista de Servidores */}
                            <View style={{ padding: 24 }}>
                                <Text style={{ color: TEXT_SECONDARY, fontSize: 15, fontWeight: '600', marginBottom: 16, textAlign: 'center' }}>
                                    Seleccioná un servidor de transmisión
                                </Text>

                                <FlatList
                                    data={selectedEventModal.servers}
                                    keyExtractor={(_, index) => index.toString()}
                                    showsVerticalScrollIndicator={false}
                                    renderItem={({ item, index }) => (
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
                                            borderWidth={0} scaleTo={1.03}
                                            style={{ borderRadius: 12, marginBottom: 10 }}
                                        >
                                            {(focused: boolean) => (
                                                <View style={{
                                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: 14, borderRadius: 12,
                                                    backgroundColor: focused ? ACCENT : 'rgba(255,255,255,0.05)',
                                                    borderWidth: 1.5, borderColor: focused ? 'rgba(255,255,255,0.3)' : BORDER_CARD,
                                                }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                        <Server color={focused ? '#fff' : ACCENT} size={20} />
                                                        <Text style={{ color: focused ? '#fff' : TEXT_PRIMARY, fontSize: 16, fontWeight: '800' }}>
                                                            {item.name}
                                                        </Text>
                                                    </View>
                                                    <Play color={focused ? '#fff' : ACCENT} size={18} fill={focused ? '#fff' : 'transparent'} />
                                                </View>
                                            )}
                                        </TvFocusable>
                                    )}
                                />

                                {/* Botón Cancelar */}
                                <TvFocusable onPress={() => setSelectedEventModal(null)} borderWidth={0} scaleTo={1.05} style={{ marginTop: 8, borderRadius: 12 }}>
                                    {(focused: boolean) => (
                                        <View style={{
                                            padding: 14, alignItems: 'center', borderRadius: 12,
                                            backgroundColor: focused ? LIVE_DIM : 'transparent',
                                            borderWidth: 1.5, borderColor: focused ? LIVE_RED : BORDER_CARD,
                                        }}>
                                            <Text style={{ color: focused ? LIVE_RED : TEXT_DIM, fontSize: 14, fontWeight: '700' }}>
                                                Cancelar
                                            </Text>
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
