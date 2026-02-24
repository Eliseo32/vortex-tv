import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  View, Text, FlatList, ActivityIndicator,
  Dimensions, Animated, BackHandler, ToastAndroid,
} from 'react-native';
import { Play, Info, Sparkles, Trophy, Tv, Film, Ghost, MonitorPlay } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';

import TvMovieCard from '../../components/tv/TvMovieCard';
import TvTopBar from '../../components/tv/TvTopBar';
import TvSideBar from '../../components/tv/TvSideBar';
import TvFocusable from '../../components/tv/TvFocusable';

import TvSearchScreen from './TvSearchScreen';
import TvMyListScreen from './TvMyListScreen';
import TvLiveScreen from './TvLiveScreen';
import TvHistoryScreen from './TvHistoryScreen';
import TvSportsScreen from './TvSportsScreen';

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

// ─── Configuración de secciones del home ──────────────────────────────────────
// Cada row tiene: título, ícono, color de acento, y cómo filtrar cloudContent
interface ContentRow {
  id: string;
  title: string;
  Icon: any;
  accent: string;
  filter: (item: any) => boolean;
}

const HOME_ROWS: ContentRow[] = [
  {
    id: 'sports',
    title: '⚽ Deportes en Vivo',
    Icon: Trophy,
    accent: '#22c55e',
    filter: (i) => i.type === 'tv' && i.genre === 'Deportes',
  },
  {
    id: 'nacional',
    title: '📡 TV Nacional',
    Icon: Tv,
    accent: '#3b82f6',
    filter: (i) => i.type === 'tv' && i.genre === 'Nacional',
  },
  {
    id: 'movie',
    title: '🎬 Películas',
    Icon: Film,
    accent: '#FACC15',
    filter: (i) => i.type === 'movie',
  },
  {
    id: 'series',
    title: '📺 Series',
    Icon: MonitorPlay,
    accent: '#a78bfa',
    filter: (i) => i.type === 'series',
  },
  {
    id: 'anime',
    title: '👾 Anime',
    Icon: Ghost,
    accent: '#f472b6',
    filter: (i) => i.type === 'anime',
  },
  {
    id: 'entretenimiento',
    title: '🎭 Entretenimiento',
    Icon: Tv,
    accent: '#fb923c',
    filter: (i) => i.type === 'tv' && i.genre === 'Entretenimiento',
  },
  {
    id: 'noticias',
    title: '📰 Noticias',
    Icon: Tv,
    accent: '#94a3b8',
    filter: (i) => i.type === 'tv' && i.genre === 'Noticias',
  },
  {
    id: 'music',
    title: '🎵 Música',
    Icon: Tv,
    accent: '#e879f9',
    filter: (i) => i.type === 'tv' && i.genre === 'Música',
  },
  {
    id: 'infantil',
    title: '🧒 Infantil',
    Icon: Tv,
    accent: '#34d399',
    filter: (i) => i.type === 'tv' && i.genre === 'Infantiles',
  },
];

const PremiumHeroButton = ({ icon: Icon, title, onPress, isPrimary = false }: any) => (
  <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.06} style={{ borderRadius: 10, marginRight: 12 }}>
    {(focused: boolean) => (
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10,
        backgroundColor: isPrimary ? (focused ? '#fff' : '#FACC15') : (focused ? '#fff' : 'rgba(255,255,255,0.15)'),
        borderWidth: isPrimary ? 0 : 2, borderColor: focused ? 'transparent' : 'rgba(255,255,255,0.2)'
      }}>
        <Icon color={isPrimary ? "#000" : (focused ? "#000" : "#fff")} size={18} fill={isPrimary ? "#000" : "none"} />
        <Text style={{ fontWeight: 'black', fontSize: 13, marginLeft: 8, textTransform: 'uppercase', letterSpacing: 1.2, color: isPrimary ? '#000' : (focused ? '#000' : '#fff') }}>
          {title}
        </Text>
      </View>
    )}
  </TvFocusable>
);

// ─── Row de contenido del home ────────────────────────────────────────────────
function ContentRowView({ row, onPress }: { row: { id: string; title: string; accent: string; items: any[] }; onPress: (item: any) => void }) {
  return (
    <View style={{ marginBottom: 36 }}>
      {/* Cabecera de la fila */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingLeft: 68 }}>
        <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: row.accent, marginRight: 10 }} />
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.2 }}>
          {row.title}
        </Text>
        <Text style={{ color: '#4B5563', fontSize: 13, marginLeft: 10, fontWeight: '600' }}>
          {row.items.length} títulos
        </Text>
      </View>

      {/* Lista horizontal */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={row.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 60, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <TvMovieCard item={item} onPress={() => onPress(item)} accentColor={row.accent} />
        )}
      />
    </View>
  );
}

export default function TvHomeScreen() {
  const navigation = useNavigation<any>();
  const { cloudContent, fetchCloudContent, isLoadingContent } = useAppStore();
  const [currentTab, setCurrentTab] = useState('home');

  // Animaciones y estados del hero
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [activeHeroItem, setActiveHeroItem] = useState<any>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Referencias scroll/back
  const flatListRef = useRef<FlatList>(null);
  const scrollOffset = useRef(0);
  const backPressCount = useRef(0);

  useEffect(() => { if (cloudContent.length === 0) fetchCloudContent(); }, []);

  // Hero: primeras 5 películas o series
  const featuredItems = useMemo(
    () => cloudContent.filter(i => i.type === 'movie' || i.type === 'series' || i.type === 'anime').slice(0, 5),
    [cloudContent],
  );

  useEffect(() => {
    if (featuredItems.length > 0 && !activeHeroItem) setActiveHeroItem(featuredItems[0]);
  }, [featuredItems]);

  // Carrusel automático con crossfade
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (featuredItems.length > 1) {
      interval = setInterval(() => {
        Animated.timing(fadeAnim, { toValue: 0.2, duration: 400, useNativeDriver: true }).start(() => {
          setCarouselIndex((prev) => {
            const next = (prev + 1) % featuredItems.length;
            setActiveHeroItem(featuredItems[next]);
            return next;
          });
          Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        });
      }, 8000);
    }
    return () => clearInterval(interval);
  }, [featuredItems, fadeAnim]);

  // Filas del home: solo mostramos filas con contenido
  const contentRows = useMemo(() => {
    return HOME_ROWS.map(row => ({
      ...row,
      items: cloudContent.filter(row.filter).slice(0, 20),
    })).filter(row => row.items.length > 0);
  }, [cloudContent]);

  // Botón ATRÁS
  useEffect(() => {
    const onBackPress = () => {
      if (currentTab !== 'home') { setCurrentTab('home'); return true; }
      if (scrollOffset.current > 100) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        return true;
      }
      if (backPressCount.current === 1) { BackHandler.exitApp(); return true; }
      backPressCount.current = 1;
      ToastAndroid.show('Presioná ATRÁS de nuevo para salir', ToastAndroid.SHORT);
      setTimeout(() => { backPressCount.current = 0; }, 2000);
      return true;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => handler.remove();
  }, [currentTab]);

  const handleScroll = (event: any) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  };

  if (isLoadingContent) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#FACC15" />
      </View>
    );
  }

  // ─── Renderizado por tab ───────────────────────────────────────────────────
  const renderContent = () => {
    if (currentTab === 'search') return <TvSearchScreen />;
    if (currentTab === 'mylist') return <TvMyListScreen />;
    if (currentTab === 'history') return <TvHistoryScreen />;
    if (currentTab === 'sport') return <TvSportsScreen />;
    if (['movie', 'series', 'anime', 'tv'].includes(currentTab)) {
      return <TvLiveScreen category={currentTab} />;
    }

    // ─── HOME ──────────────────────────────────────────────────────────────
    return (
      <View style={{ flex: 1 }}>
        <FlatList
          ref={flatListRef}
          data={contentRows}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 150 }}
          ListHeaderComponent={
            <View style={{ alignItems: 'center', marginTop: 100, marginBottom: 36 }}>
              {/* ── HERO BANNER ─────────────────────────────────────── */}
              {activeHeroItem && (
                <View style={{
                  width: windowWidth - 200,
                  height: windowHeight * 0.52,
                  borderRadius: 24, overflow: 'hidden',
                  backgroundColor: '#111',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.06)',
                }}>
                  <Animated.Image
                    key={activeHeroItem.id}
                    source={{ uri: activeHeroItem.backdrop || activeHeroItem.poster }}
                    style={[{ width: '100%', height: '100%', resizeMode: 'cover', position: 'absolute' }, { opacity: fadeAnim }]}
                  />

                  {/* Degradado izquierdo */}
                  <View style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: '65%',
                    backgroundColor: 'rgba(5,5,5,0.88)',
                  }} />
                  {/* Degradado inferior */}
                  <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
                    backgroundColor: 'rgba(5,5,5,0.85)',
                  }} />

                  {/* Contenido del hero */}
                  <Animated.View style={{ position: 'absolute', bottom: 32, left: 40, width: '52%', opacity: fadeAnim }}>

                    {/* Badge de tipo */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
                        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                      }}>
                        <Sparkles color="#FACC15" size={11} />
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginLeft: 5, textTransform: 'uppercase' }}>
                          {activeHeroItem.type === 'movie' ? 'Película' : activeHeroItem.type === 'series' ? 'Serie' : 'Anime'}
                        </Text>
                      </View>
                      {activeHeroItem.year && (
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: '#374151', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 }}>
                          <Text style={{ color: '#9CA3AF', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>{activeHeroItem.year}</Text>
                        </View>
                      )}
                      {activeHeroItem.rating && (
                        <View style={{ backgroundColor: 'rgba(250,204,21,0.1)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.3)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 }}>
                          <Text style={{ color: '#FACC15', fontSize: 9, fontWeight: '900' }}>⭐ {activeHeroItem.rating}</Text>
                        </View>
                      )}
                    </View>

                    {/* Título */}
                    <Text numberOfLines={2} style={{
                      fontSize: 38, lineHeight: 42, color: '#fff', fontWeight: '900',
                      textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 },
                      textShadowRadius: 10, marginBottom: 10, letterSpacing: -0.5,
                    }}>
                      {activeHeroItem.title}
                    </Text>

                    {/* Género */}
                    {activeHeroItem.genre && (
                      <Text style={{ color: '#FACC15', fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {activeHeroItem.genre}
                      </Text>
                    )}

                    <Text numberOfLines={2} style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 20, lineHeight: 20 }}>
                      {activeHeroItem.description}
                    </Text>

                    {/* Botones */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                      <PremiumHeroButton icon={Play} title="Reproducir" isPrimary={true} onPress={() => navigation.navigate('DetailTV', { item: activeHeroItem })} />
                      <PremiumHeroButton icon={Info} title="Más Info" isPrimary={false} onPress={() => navigation.navigate('DetailTV', { item: activeHeroItem })} />
                    </View>

                    {/* Indicadores del carrusel */}
                    {featuredItems.length > 1 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {featuredItems.map((_, idx) => (
                          <View key={idx} style={{
                            height: 3, borderRadius: 2,
                            width: idx === carouselIndex ? 28 : 8,
                            backgroundColor: idx === carouselIndex ? '#FACC15' : 'rgba(255,255,255,0.2)',
                          }} />
                        ))}
                      </View>
                    )}
                  </Animated.View>
                </View>
              )}
            </View>
          }
          renderItem={({ item: row }) => (
            <ContentRowView
              key={row.id}
              row={row}
              onPress={(item) => navigation.navigate('DetailTV', { item })}
            />
          )}
        />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#050505' }}>
      {/* Fondo premium */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'visible' }} pointerEvents="none">
        <View style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: windowHeight * 0.4,
          backgroundColor: 'transparent',
          borderTopWidth: windowHeight * 0.4,
          borderColor: 'rgba(250, 204, 21, 0.07)',
          borderLeftWidth: windowWidth,
          borderLeftColor: 'transparent',
          opacity: 0.8,
        }} />
        <View style={{ position: 'absolute', bottom: 0, width: '100%', height: '60%', backgroundColor: 'rgba(0,0,0,0.4)' }} />
      </View>

      <View style={{ flex: 1 }}>{renderContent()}</View>

      {/* SIDEBAR */}
      <TvSideBar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* TOPBAR */}
      <View style={{ zIndex: 50, position: 'absolute', top: 0, width: '100%' }}>
        <TvTopBar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      </View>
    </View>
  );
}