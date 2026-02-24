import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    View, Text, FlatList, Image, Dimensions, Animated,
    StyleSheet, BackHandler,
} from 'react-native';
import { Play, Trophy, Tv, Calendar, Wifi, WifiOff } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

const SPORT_ACCENT = '#22c55e';
const SPORT_ACCENT_DIM = 'rgba(34,197,94,0.15)';

// ─── Tarjeta de partido de la agenda ─────────────────────────────────────────
function AgendaMatchCard({ event, onPress }: { event: any; onPress: () => void }) {
    const hasVideo = !!event.videoUrl;

    return (
        <TvFocusable
            onPress={onPress}
            borderWidth={0}
            scaleTo={1.06}
            style={{ borderRadius: 16, marginRight: 16 }}
            focusedStyle={{ backgroundColor: 'transparent' }}
        >
            {(focused: boolean) => (
                <View style={{
                    width: 220,
                    borderRadius: 16,
                    overflow: 'hidden',
                    borderWidth: focused ? 2 : 1,
                    borderColor: focused ? SPORT_ACCENT : 'rgba(255,255,255,0.10)',
                    backgroundColor: focused ? 'rgba(34,197,94,0.06)' : 'rgba(15,15,15,0.95)',
                }}>
                    {/* Cabecera: hora + liga */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        padding: 12, paddingBottom: 8,
                        backgroundColor: focused ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: SPORT_ACCENT, fontSize: 16 }}>{event.sportIcon || '🏆'}</Text>
                            <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                                {event.league}
                            </Text>
                        </View>
                        <View style={{
                            backgroundColor: focused ? SPORT_ACCENT : 'rgba(34,197,94,0.2)',
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                        }}>
                            <Text style={{ color: focused ? '#000' : SPORT_ACCENT, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                                {event.time}
                            </Text>
                        </View>
                    </View>

                    {/* Cuerpo: escudos y equipos */}
                    <View style={{ padding: 14, alignItems: 'center' }}>
                        {/* Ambos escudos + VS */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
                            {/* Equipo 1 */}
                            <View style={{ alignItems: 'center', flex: 1, gap: 6 }}>
                                {event.logo1 ? (
                                    <Image
                                        source={{ uri: event.logo1 }}
                                        style={{ width: 52, height: 52 }}
                                        resizeMode="contain"
                                    />
                                ) : (
                                    <View style={{
                                        width: 52, height: 52, borderRadius: 26,
                                        backgroundColor: 'rgba(255,255,255,0.07)',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Trophy color="#6B7280" size={22} />
                                    </View>
                                )}
                                <Text numberOfLines={2} style={{
                                    color: focused ? '#fff' : '#D1D5DB',
                                    fontSize: 10, fontWeight: '700',
                                    textAlign: 'center', lineHeight: 14,
                                }}>
                                    {event.team1}
                                </Text>
                            </View>

                            {/* VS */}
                            <View style={{ paddingHorizontal: 8 }}>
                                <Text style={{ color: '#4B5563', fontSize: 13, fontWeight: '900', letterSpacing: 1 }}>
                                    VS
                                </Text>
                            </View>

                            {/* Equipo 2 */}
                            <View style={{ alignItems: 'center', flex: 1, gap: 6 }}>
                                {event.logo2 ? (
                                    <Image
                                        source={{ uri: event.logo2 }}
                                        style={{ width: 52, height: 52 }}
                                        resizeMode="contain"
                                    />
                                ) : (
                                    <View style={{
                                        width: 52, height: 52, borderRadius: 26,
                                        backgroundColor: 'rgba(255,255,255,0.07)',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Trophy color="#6B7280" size={22} />
                                    </View>
                                )}
                                <Text numberOfLines={2} style={{
                                    color: focused ? '#fff' : '#D1D5DB',
                                    fontSize: 10, fontWeight: '700',
                                    textAlign: 'center', lineHeight: 14,
                                }}>
                                    {event.team2}
                                </Text>
                            </View>
                        </View>

                        {/* Canal */}
                        <View style={{
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
                            width: '100%', justifyContent: 'center', gap: 6,
                        }}>
                            {hasVideo ? (
                                <Wifi color={SPORT_ACCENT} size={11} />
                            ) : (
                                <WifiOff color="#6B7280" size={11} />
                            )}
                            <Text numberOfLines={1} style={{
                                color: hasVideo ? '#9CA3AF' : '#4B5563',
                                fontSize: 10, fontWeight: '600',
                            }}>
                                {event.channelName || 'Canal no disponible'}
                            </Text>
                            {event.quality ? (
                                <View style={{
                                    backgroundColor: hasVideo ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                                    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
                                }}>
                                    <Text style={{ color: hasVideo ? SPORT_ACCENT : '#6B7280', fontSize: 8, fontWeight: '800' }}>
                                        {event.quality.replace('Calidad ', '')}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </View>

                    {/* Footer: botón si hay video */}
                    {focused && hasVideo && (
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            paddingVertical: 10, backgroundColor: SPORT_ACCENT, gap: 6,
                        }}>
                            <Play color="#000" size={13} fill="#000" />
                            <Text style={{ color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' }}>
                                Ver en vivo
                            </Text>
                        </View>
                    )}
                    {focused && !hasVideo && (
                        <View style={{
                            alignItems: 'center', justifyContent: 'center',
                            paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.04)',
                        }}>
                            <Text style={{ color: '#4B5563', fontSize: 10, fontWeight: '700' }}>
                                Canal no disponible
                            </Text>
                        </View>
                    )}
                </View>
            )}
        </TvFocusable>
    );
}

// ─── Sección de Agenda del Día ────────────────────────────────────────────────
function AgendaSection({ events }: { events: any[] }) {
    const navigation = useNavigation<any>();

    if (events.length === 0) return null;

    const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1);

    return (
        <View style={{ marginBottom: 36 }}>
            {/* Cabecera de la sección */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, paddingLeft: 68, gap: 10 }}>
                <Calendar color={SPORT_ACCENT} size={20} strokeWidth={2.5} />
                <View>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.2 }}>
                        Agenda del Día
                    </Text>
                    <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600', marginTop: 1 }}>
                        {todayCapitalized} · {events.length} {events.length === 1 ? 'partido' : 'partidos'}
                    </Text>
                </View>
            </View>

            {/* Lista horizontal de tarjetas */}
            <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={events}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 64, paddingBottom: 8 }}
                renderItem={({ item }) => (
                    <AgendaMatchCard
                        event={item}
                        onPress={() => {
                            if (!item.videoUrl) return;
                            // Construimos un item compatible con TvPlayerScreen
                            navigation.navigate('PlayerTV', {
                                item: {
                                    id: item.id,
                                    title: `${item.team1} vs ${item.team2}`,
                                    type: 'tv',
                                    videoUrl: item.videoUrl,
                                    servers: item.servers || [],
                                    poster: item.logo1 || '',
                                    backdrop: item.logo1 || '',
                                    description: `${item.league} · ${item.time} · ${item.channelName}`,
                                    genre: 'Deportes',
                                    year: 'LIVE',
                                    rating: '',
                                },
                            });
                        }}
                    />
                )}
            />
        </View>
    );
}

// ─── Pantalla principal de Deportes ──────────────────────────────────────────
export default function TvSportsScreen() {
    const navigation = useNavigation<any>();
    const { cloudContent, featuredEvents } = useAppStore();

    const flatListRef = useRef<FlatList>(null);
    const scrollOffset = useRef(0);

    const [activeHeroItem, setActiveHeroItem] = useState<any>(null);
    const [carouselIndex, setCarouselIndex] = useState(0);
    const heroFadeAnim = useRef(new Animated.Value(1)).current;

    // ─── Canales de deporte: type 'tv' + genre 'Deportes' ──────────────────
    const sportChannels = useMemo(
        () => cloudContent.filter((item) => item.type === 'tv' && item.genre === 'Deportes'),
        [cloudContent],
    );

    // ─── Agenda del día desde Firestore ─────────────────────────────────────
    const todayAgenda = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return featuredEvents
            .filter(e => e.date === today)
            .sort((a, b) => a.time.localeCompare(b.time));
    }, [featuredEvents]);

    const heroItems = useMemo(() => sportChannels.slice(0, 5), [sportChannels]);

    // Agrupamos los canales por genre o type
    const groupedChannels = useMemo(() => {
        const groups: Record<string, typeof sportChannels> = {};
        sportChannels.forEach((item) => {
            const key = item.genre || item.type || 'Otros';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return Object.entries(groups).map(([title, items]) => ({ title, items }));
    }, [sportChannels]);

    // ─── Inicializar hero ─────────────────────────────────────────────────
    useEffect(() => {
        if (heroItems.length > 0) setActiveHeroItem(heroItems[0]);
        setCarouselIndex(0);
    }, [heroItems]);

    // ─── Rotación del carousel ────────────────────────────────────────────
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (heroItems.length > 1) {
            interval = setInterval(() => {
                Animated.timing(heroFadeAnim, { toValue: 0.3, duration: 400, useNativeDriver: true }).start(() => {
                    setCarouselIndex((prev) => {
                        const next = (prev + 1) % heroItems.length;
                        setActiveHeroItem(heroItems[next]);
                        return next;
                    });
                    Animated.timing(heroFadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
                });
            }, 7000);
        }
        return () => clearInterval(interval);
    }, [heroItems]);

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

    // ─── Estado vacío (sin agenda y sin canales) ───────────────────────────
    if (sportChannels.length === 0 && todayAgenda.length === 0) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' }}>
                <Trophy color={SPORT_ACCENT} size={64} strokeWidth={1.5} />
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 24, letterSpacing: -0.5 }}>
                    Sin contenido deportivo
                </Text>
                <Text style={{ color: '#6B7280', fontSize: 15, marginTop: 10, textAlign: 'center', maxWidth: 380 }}>
                    Agregá canales con genre "Deportes" o esperá la actualización de la agenda diaria.
                </Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#050505' }}>

            {/* Fondo premium verde */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'visible' }} pointerEvents="none">
                <View style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    height: windowHeight * 0.4,
                    backgroundColor: 'transparent',
                    borderTopWidth: windowHeight * 0.4,
                    borderColor: 'rgba(34,197,94,0.07)',
                    borderLeftWidth: windowWidth,
                    borderLeftColor: 'transparent',
                    opacity: 0.9,
                }} />
                <View style={{ position: 'absolute', bottom: 0, width: '100%', height: '60%', backgroundColor: 'rgba(0,0,0,0.5)' }} />
            </View>

            {/* Lista general */}
            <FlatList
                ref={flatListRef}
                data={groupedChannels}
                keyExtractor={(_, idx) => idx.toString()}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingBottom: 200, paddingTop: 120 }}

                ListHeaderComponent={
                    <View>
                        {/* Título de la sección */}
                        <View style={{ marginBottom: 20, paddingLeft: 64, marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                            <Trophy color={SPORT_ACCENT} size={28} strokeWidth={2.5} />
                            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginLeft: 12 }}>
                                Deportes
                            </Text>
                        </View>

                        {/* ── AGENDA DEL DÍA ─────────────────────────────── */}
                        {todayAgenda.length > 0 && (
                            <AgendaSection events={todayAgenda} />
                        )}

                        {/* ── HERO BANNER (primer canal deportivo) ──────── */}
                        {activeHeroItem ? (
                            <View style={{
                                height: windowHeight * 0.38,
                                marginBottom: 36, borderRadius: 16, overflow: 'hidden',
                                marginHorizontal: 20, position: 'relative',
                                borderWidth: 1, borderColor: 'rgba(34,197,94,0.18)',
                                backgroundColor: '#111',
                            }}>
                                <Animated.Image
                                    key={activeHeroItem.id}
                                    source={{ uri: activeHeroItem.backdrop || activeHeroItem.poster }}
                                    style={[{ width: '100%', height: '100%', position: 'absolute' }, { opacity: heroFadeAnim }]}
                                    resizeMode="cover"
                                />
                                <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '60%', backgroundColor: 'rgba(5,5,5,0.7)' }} />
                                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', backgroundColor: 'rgba(5,5,5,0.6)' }} />

                                <Animated.View style={{ position: 'absolute', bottom: 24, left: 30, width: '58%', opacity: heroFadeAnim }}>
                                    {/* Badge */}
                                    <View style={{
                                        flexDirection: 'row', alignItems: 'center',
                                        backgroundColor: SPORT_ACCENT_DIM,
                                        borderWidth: 1, borderColor: SPORT_ACCENT,
                                        paddingHorizontal: 10, paddingVertical: 4,
                                        borderRadius: 6, alignSelf: 'flex-start', marginBottom: 10,
                                    }}>
                                        <Tv color={SPORT_ACCENT} size={11} />
                                        <Text style={{ color: SPORT_ACCENT, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginLeft: 5, textTransform: 'uppercase' }}>
                                            Canal Deportivo
                                        </Text>
                                    </View>

                                    <Text numberOfLines={1} style={{
                                        color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginBottom: 8,
                                        textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8,
                                    }}>
                                        {activeHeroItem.title}
                                    </Text>
                                    <Text numberOfLines={2} style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 16, lineHeight: 20 }}>
                                        {activeHeroItem.description}
                                    </Text>

                                    <TvFocusable
                                        onPress={() => navigation.navigate('DetailTV', { item: activeHeroItem })}
                                        borderWidth={0} scaleTo={1.05}
                                        style={{ borderRadius: 8, alignSelf: 'flex-start' }}
                                    >
                                        {(focused: boolean) => (
                                            <View style={{
                                                flexDirection: 'row', alignItems: 'center',
                                                paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8,
                                                backgroundColor: focused ? '#fff' : SPORT_ACCENT,
                                            }}>
                                                <Play color="#000" size={15} fill="#000" />
                                                <Text style={{ color: '#000', fontWeight: '900', fontSize: 13, marginLeft: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                                                    Ver Ahora
                                                </Text>
                                            </View>
                                        )}
                                    </TvFocusable>

                                    {heroItems.length > 1 && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 6 }}>
                                            {heroItems.map((_, idx) => (
                                                <View key={idx} style={{
                                                    height: 4, borderRadius: 2,
                                                    width: idx === carouselIndex ? 32 : 10,
                                                    backgroundColor: idx === carouselIndex ? SPORT_ACCENT : 'rgba(255,255,255,0.25)',
                                                }} />
                                            ))}
                                        </View>
                                    )}
                                </Animated.View>
                            </View>
                        ) : null}
                    </View>
                }

                renderItem={({ item: group }) => (
                    <View style={{ marginBottom: 32 }}>
                        {/* Título del grupo */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingLeft: 64 }}>
                            <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: SPORT_ACCENT, marginRight: 10 }} />
                            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 }}>
                                {group.title}
                            </Text>
                        </View>

                        {/* Lista horizontal de canales */}
                        <FlatList
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            data={group.items}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ paddingHorizontal: 56, paddingBottom: 8 }}
                            renderItem={({ item }) => (
                                <TvFocusable
                                    onPress={() => navigation.navigate('DetailTV', { item })}
                                    borderWidth={0} scaleTo={1.08}
                                    style={{ borderRadius: 12, marginRight: 14 }}
                                    focusedStyle={{ backgroundColor: 'transparent' }}
                                >
                                    {(focused: boolean) => (
                                        <View style={{
                                            width: 180, borderRadius: 12, overflow: 'hidden',
                                            borderWidth: focused ? 2 : 1,
                                            borderColor: focused ? SPORT_ACCENT : 'rgba(255,255,255,0.08)',
                                            backgroundColor: '#111',
                                        }}>
                                            <View style={{ width: '100%', height: 110, backgroundColor: '#1a1a1a' }}>
                                                {item.poster ? (
                                                    <Image source={{ uri: item.poster }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                ) : (
                                                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                                        <Trophy color={SPORT_ACCENT} size={36} strokeWidth={1.5} />
                                                    </View>
                                                )}
                                                {focused && (
                                                    <View style={{
                                                        ...StyleSheet.absoluteFillObject,
                                                        backgroundColor: 'rgba(0,0,0,0.4)',
                                                        alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <Play color="#fff" size={28} fill="#fff" />
                                                    </View>
                                                )}
                                            </View>
                                            <View style={{ padding: 10 }}>
                                                <Text numberOfLines={1} style={{ color: focused ? SPORT_ACCENT : '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 }}>
                                                    {item.title}
                                                </Text>
                                                {item.genre ? (
                                                    <Text numberOfLines={1} style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
                                                        {item.genre}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </View>
                                    )}
                                </TvFocusable>
                            )}
                        />
                    </View>
                )}
            />
        </View>
    );
}
