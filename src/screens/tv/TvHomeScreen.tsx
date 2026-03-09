import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, ActivityIndicator,
  Dimensions, Animated, BackHandler, ToastAndroid
} from 'react-native';
import { Play, Info, Sparkles, Trophy, Tv, Film, Ghost, MonitorPlay } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import { LinearGradient } from 'expo-linear-gradient';

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
    accent: '#B026FF',
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

const PremiumHeroButton = ({ icon: Icon, title, onPress, isPrimary = false, nextFocusUp, nextFocusLeft, hasTVPreferredFocus }: any) => (
  <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.06} style={{ borderRadius: 10, marginRight: 12 }} nextFocusUp={nextFocusUp} nextFocusLeft={nextFocusLeft} hasTVPreferredFocus={hasTVPreferredFocus}>
    {(focused: boolean) => (
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10,
        backgroundColor: isPrimary ? (focused ? '#fff' : '#B026FF') : (focused ? '#fff' : 'rgba(255,255,255,0.15)'),
        borderWidth: isPrimary ? 0 : 2, borderColor: focused ? 'transparent' : 'rgba(255,255,255,0.2)'
      }}>
        <Icon color={isPrimary ? "#000" : (focused ? "#000" : "#fff")} size={18} fill={isPrimary ? "#000" : "none"} />
        <Text style={{ fontWeight: '900', fontSize: 13, marginLeft: 8, textTransform: 'uppercase', letterSpacing: 1.2, color: isPrimary ? '#000' : (focused ? '#000' : '#fff') }}>
          {title}
        </Text>
      </View>
    )}
  </TvFocusable>
);

// ─── Row de contenido del home (PREMIUM) ──────────────────────────────────────
const ContentRowView = React.memo(function ContentRowView({ row, onPress }: { row: { id: string; title: string; accent: string; items: any[] }; onPress: (item: any) => void }) {
  const renderCard = useCallback(({ item }: { item: any }) => (
    <TvMovieCard item={item} onPress={() => onPress(item)} accentColor={row.accent} width={140} height={210} />
  ), [onPress, row.accent]);

  return (
    <View style={{ marginBottom: 44 }}>
      {/* Cabecera de la fila */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingLeft: 24 }}>
        <View style={{ width: 4, height: 22, borderRadius: 2, backgroundColor: row.accent, marginRight: 12 }} />
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.3 }}>
          {row.title}
        </Text>
        <View style={{ marginLeft: 12, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
          <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '700' }}>
            {row.items.length}
          </Text>
        </View>
      </View>

      {/* Lista horizontal — optimized */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={row.items}
        keyExtractor={itemKeyExtractor}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}
        renderItem={renderCard}
        initialNumToRender={5}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={true}
      />
    </View>
  );
}, (prev, next) => prev.row.id === next.row.id && prev.row.items.length === next.row.items.length);

const itemKeyExtractor = (item: any) => item.id;

export default function TvHomeScreen() {
  const navigation = useNavigation<any>();
  const { cloudContent, fetchCloudContent, isLoadingContent, userId } = useAppStore();
  const [currentTab, setCurrentTab] = useState('home');
  const [forceFocusTopBar, setForceFocusTopBar] = useState(false);
  const lastInteractionTime = useRef(Date.now());
  const topBarNodeId = useRef<any>(null); // Referencia estricta para la TopBar

  // Animaciones y estados del hero
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [activeHeroItem, setActiveHeroItem] = useState<any>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Referencias scroll/back
  const flatListRef = useRef<FlatList>(null);
  const scrollOffset = useRef(0);
  const backPressCount = useRef(0);

  useEffect(() => { if (userId) fetchCloudContent(); }, [userId]);

  // Hero: primeras 5 películas o series
  const featuredItems = useMemo(
    () => cloudContent.filter(i => i.type === 'movie' || i.type === 'series' || i.type === 'anime').slice(0, 5),
    [cloudContent],
  );

  useEffect(() => {
    if (featuredItems.length > 0 && !activeHeroItem) setActiveHeroItem(featuredItems[0]);
  }, [featuredItems]);

  // Track user interactions to pause carousel (timestamp only)
  // Note: TVEventHandler API changed in react-native-tvos 0.81+
  // We just track via onFocus/onPress handlers instead

  // Carrusel automático con crossfade (pausado si hay interacción)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (featuredItems.length > 1) {
      interval = setInterval(() => {
        // Pausar si el usuario usó el control en los últimos 15 segundos
        if (Date.now() - lastInteractionTime.current < 15000) return;

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
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // 1. Si no estamos en el tab principal, volver a Inicio
        if (currentTab !== 'home') { setCurrentTab('home'); return true; }

        // 2. Si estamos desplazados hacia abajo, subir y forzar foco arriba
        if (scrollOffset.current > 100) {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          setForceFocusTopBar(true);
          return true;
        }

        // 3. Si estamos arriba, pero sin foco en la TopBar, mandarlo a la TopBar pre-salida
        if (!forceFocusTopBar && scrollOffset.current <= 100) {
          setForceFocusTopBar(true);
          // NO hacemos return true si el contador ya está en 1, para permitir salir rápido
          if (backPressCount.current !== 1) {
            ToastAndroid.show('Presioná ATRÁS de nuevo para salir', ToastAndroid.SHORT);
            backPressCount.current = 1;
            setTimeout(() => { backPressCount.current = 0; }, 2000);
            return true;
          }
        }

        // 4. Salida real de la TV app
        if (backPressCount.current === 1) { BackHandler.exitApp(); return true; }

        backPressCount.current = 1;
        ToastAndroid.show('Presioná ATRÁS de nuevo para salir', ToastAndroid.SHORT);
        setTimeout(() => { backPressCount.current = 0; }, 2000);
        return true;
      };

      const handler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => handler.remove();
    }, [currentTab, forceFocusTopBar])
  );

  const handleScroll = (event: any) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  };

  if (isLoadingContent) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#B026FF" />
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
          keyExtractor={itemKeyExtractor}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          contentContainerStyle={{ paddingBottom: 150 }}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          windowSize={5}
          removeClippedSubviews={true}
          ListHeaderComponent={
            <View style={{ marginBottom: 40, paddingTop: 20 }}>
              {/* ── HERO BANNER ───────────────────── */}
              {activeHeroItem && (
                <View style={{ width: '100%', height: windowHeight * 0.58, backgroundColor: '#050505' }}>
                  {/* Imagen de fondo - esta sola tiene overflow hidden */}
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
                    <Animated.Image
                      key={activeHeroItem.id}
                      source={{ uri: activeHeroItem.backdrop || activeHeroItem.poster }}
                      style={[{ width: '100%', height: '100%', resizeMode: 'cover' }, { opacity: fadeAnim }]}
                    />
                  </View>

                  {/* Gradiente izquierdo para legibilidad del texto */}
                  <LinearGradient
                    colors={['rgba(5,5,5,1)', 'rgba(5,5,5,0.85)', 'rgba(5,5,5,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.6, y: 0 }}
                    style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '70%' }}
                    pointerEvents="none"
                  />

                  {/* Gradiente inferior */}
                  <LinearGradient
                    colors={['transparent', 'rgba(5,5,5,0.7)', '#050505']}
                    start={{ x: 0, y: 0.4 }}
                    end={{ x: 0, y: 1 }}
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' }}
                    pointerEvents="none"
                  />

                  {/* Contenido del Hero (texto) */}
                  <View style={{ position: 'absolute', bottom: 80, left: 50, width: '55%' }} pointerEvents="none">
                    {/* Metadata */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#B026FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}>
                        {/* @ts-ignore */}
                        <Sparkles color="#000" size={12} fill="#000" />
                        <Text style={{ color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginLeft: 6, textTransform: 'uppercase' }}>
                          {activeHeroItem.type === 'movie' ? 'Película' : activeHeroItem.type === 'series' ? 'Serie' : 'Anime'}
                        </Text>
                      </View>
                      {activeHeroItem.year && (
                        <Text style={{ color: '#D1D5DB', fontSize: 14, fontWeight: '800', letterSpacing: 1 }}>{activeHeroItem.year}</Text>
                      )}
                      {activeHeroItem.rating && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                          <Text style={{ color: '#B026FF', fontSize: 12, fontWeight: '900' }}>{activeHeroItem.rating} ★</Text>
                        </View>
                      )}
                    </View>

                    {/* Título */}
                    <Text numberOfLines={2} style={{
                      fontSize: 54, lineHeight: 58, color: '#fff', fontWeight: '900',
                      textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 4 },
                      textShadowRadius: 16, marginBottom: 12, letterSpacing: -1,
                    }}>
                      {activeHeroItem.title}
                    </Text>

                    {/* Géneros */}
                    {activeHeroItem.genre && (
                      <Text style={{ color: '#A3A3A3', fontSize: 14, fontWeight: '700', marginBottom: 16, letterSpacing: 1 }}>
                        {activeHeroItem.genre.replace(/,/g, ' • ')}
                      </Text>
                    )}

                    {/* Sinopsis */}
                    <Text numberOfLines={3} style={{ color: '#D1D5DB', fontSize: 15, marginBottom: 10, lineHeight: 22, fontWeight: '500', maxWidth: '90%' }}>
                      {activeHeroItem.description}
                    </Text>
                  </View>

                  {/* Botones de acción - FUERA de pointerEvents=none, en flow normal para recibir foco */}
                  <View style={{ position: 'absolute', bottom: 20, left: 50, flexDirection: 'row', alignItems: 'center' }}>
                    <PremiumHeroButton
                      icon={Play} title="Reproducir" isPrimary={true}
                      onPress={() => {
                        lastInteractionTime.current = Date.now();
                        navigation.navigate('DetailTV', { item: activeHeroItem });
                      }}
                      hasTVPreferredFocus={true}
                    />
                    <PremiumHeroButton
                      icon={Info} title="Más Info" isPrimary={false}
                      onPress={() => {
                        lastInteractionTime.current = Date.now();
                        navigation.navigate('DetailTV', { item: activeHeroItem });
                      }}
                    />
                  </View>

                  {/* Indicadores del carrusel */}
                  {featuredItems.length > 1 && (
                    <View style={{ position: 'absolute', bottom: 8, left: 50, flexDirection: 'row', alignItems: 'center', gap: 6 }} pointerEvents="none">
                      {featuredItems.map((_, idx) => (
                        <View key={idx} style={{
                          height: 4, borderRadius: 2,
                          width: idx === carouselIndex ? 36 : 8,
                          backgroundColor: idx === carouselIndex ? '#fff' : 'rgba(255,255,255,0.3)',
                        }} />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          }
          renderItem={({ item: row }) => (
            <ContentRowView
              key={row.id}
              row={row}
              onPress={(item) => {
                lastInteractionTime.current = Date.now();
                navigation.navigate('DetailTV', { item });
              }}
            />
          )}
        />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#050505', flexDirection: 'row' }}>
      {/* SIDEBAR - Flex layout */}
      <TvSideBar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* CONTENIDO PRINCIPAL */}
      <View style={{ flex: 1 }}>



        {/* TOPBAR EN NORMAL FLOW */}
        <View style={{ zIndex: 100, width: '100%' }} ref={topBarNodeId}>
          <TvTopBar currentTab={currentTab} setCurrentTab={setCurrentTab} forceFocus={forceFocusTopBar} />
        </View>

        {/* CONTENIDO */}
        <View style={{ flex: 1, zIndex: 10 }}>
          {renderContent()}
        </View>

      </View>
    </View>
  );
}