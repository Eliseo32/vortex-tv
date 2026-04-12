import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, ActivityIndicator,
  Dimensions, Animated, BackHandler, ToastAndroid
} from 'react-native';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import { LinearGradient } from 'expo-linear-gradient';

import TvMovieCard from '../../components/tv/TvMovieCard';
import TvTopBar from '../../components/tv/TvTopBar';
import TvFocusable from '../../components/tv/TvFocusable';
import TvChocopopSection from '../../components/tv/TvChocopopSection';
import TvLiveSectionBanner from '../../components/tv/TvLiveSectionBanner';

import TvSearchScreen from './TvSearchScreen';
import TvMyListScreen from './TvMyListScreen';
import TvDiscoverScreen from './TvDiscoverScreen';
import TvUserProfileScreen from './TvUserProfileScreen';
// TvChocopopPlayerScreen se usa como pantalla en el stack, no inline

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

// ─── Configuración de secciones del home ──────────────────────────────────────
interface ContentRow {
  id: string;
  title: string;
  accent: string;
  filter: (item: any) => boolean;
}

const HOME_ROWS: ContentRow[] = [
  {
    id: 'movie',
    title: 'PELÍCULAS RECIENTES',
    accent: '#b6a0ff',
    filter: (i) => i.type === 'movie',
  },
  {
    id: 'series',
    title: 'SERIES RECIENTES',
    accent: '#00e3fd',
    filter: (i) => i.type === 'series',
  },
  {
    id: 'anime',
    title: 'ANIME RECIENTE',
    accent: '#ffb151',
    filter: (i) => i.type === 'anime',
  },
];

const PremiumHeroButton = ({ title, onPress, isPrimary = false, nextFocusUp, nextFocusLeft, hasTVPreferredFocus }: any) => (
  <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.06} style={{ borderRadius: 10, marginRight: 16 }} nextFocusUp={nextFocusUp} nextFocusLeft={nextFocusLeft} hasTVPreferredFocus={hasTVPreferredFocus}>
    {(focused: boolean) => (
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12,
        backgroundColor: isPrimary ? (focused ? '#f0f0fd' : '#b6a0ff') : (focused ? '#f0f0fd' : 'rgba(34, 37, 50, 0.4)'),
        borderWidth: 1, borderColor: focused ? 'transparent' : 'rgba(255,255,255,0.1)'
      }}>
        <Text style={{ fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, color: isPrimary ? '#000' : (focused ? '#000' : '#f0f0fd') }}>
          {title}
        </Text>
      </View>
    )}
  </TvFocusable>
);

// ─── Row de contenido del home (PREMIUM) ──────────────────────────────────────
const ContentRowView = React.memo(function ContentRowView({ row, onPress, onEndReached }: { row: { id: string; title: string; accent: string; items: any[] }; onPress: (item: any) => void; onEndReached: () => void }) {
  const renderCard = useCallback(({ item }: { item: any }) => {
    return <TvMovieCard item={item} onPress={() => onPress(item)} accentColor={row.accent} width={180} height={260} />;
  }, [onPress, row.accent]);

  return (
    <View style={{ marginBottom: 28 }}>
      {/* Cabecera de la fila */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingLeft: 24 }}>
        <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: row.accent, marginRight: 14 }} />
        <Text style={{ color: '#f0f0fd', fontSize: 18, fontWeight: '900', letterSpacing: 1.5 }}>
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
        onEndReached={onEndReached}
        onEndReachedThreshold={1.5}
        ListFooterComponent={
          row.items.length >= 10 ? (
            <View style={{ width: 80, height: 260, justifyContent: 'center', alignItems: 'center', marginLeft: 8 }}>
              <ActivityIndicator size="large" color={row.accent} />
            </View>
          ) : null
        }
      />
    </View>
  );
}, (prev, next) => prev.row.id === next.row.id && prev.row.items.length === next.row.items.length);

const itemKeyExtractor = (item: any, index: number) => `${item.id}-${index}`;

export default function TvHomeScreen() {
  const navigation = useNavigation<any>();
  const { cloudContent, fetchCloudContent, fetchMoreContent, isLoadingContent, userId } = useAppStore();

  const [currentTab, setCurrentTab] = useState('home');
  const [forceFocusTopBar, setForceFocusTopBar] = useState(false);
  const lastInteractionTime = useRef(Date.now());
  const topBarNodeId = useRef<any>(null);
  // Lazy-mount tracking: screen component is only created on first visit
  const visitedTabs = useRef<Set<string>>(new Set(['home']));

  // Animaciones y estados del hero
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [activeHeroItem, setActiveHeroItem] = useState<any>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Referencias scroll/back
  const flatListRef = useRef<FlatList>(null);
  const scrollOffset = useRef(0);
  const backPressCount = useRef(0);

  useEffect(() => {
    if (userId) {
      // Cargamos 250 de cada uno: Total ~750 peliculas/series/animes.
      // Suficiente para el inicio sin trabar la TV (1GB RAM).
      fetchCloudContent();
    }
  }, [userId]);

  // Hero: Mix equilibrado de los últimos agregados
  const featuredItems = useMemo(() => {
    const movies = cloudContent.filter(i => i.type === 'movie');
    const series = cloudContent.filter(i => i.type === 'series');
    const anime = cloudContent.filter(i => i.type === 'anime');
    
    // Tratamos de tomar 2 pelis, 2 series y 1 anime para que haya total variedad
    const mix: any[] = [];
    if (movies[0]) mix.push(movies[0]);
    if (series[0]) mix.push(series[0]);
    if (movies[1]) mix.push(movies[1]);
    if (series[1]) mix.push(series[1]);
    if (anime[0]) mix.push(anime[0]);
    
    // Si la base de datos es pequeña y no llegamos a 5, cubrimos con lo que haya
    if (mix.length < 5) {
       const others = cloudContent.filter(i => i.type === 'movie' || i.type === 'series' || i.type === 'anime')
         .filter(i => !mix.includes(i));
       mix.push(...others.slice(0, 5 - mix.length));
    }
    
    return mix;
  }, [cloudContent]);

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

  // Filas del home: filtradas y ORDENADAS por más recientes primero
  const contentRows = useMemo(() => {
    return HOME_ROWS.map(row => ({
      ...row,
      items: cloudContent
               .filter(row.filter)
               .sort((a, b) => {
                 const yearA = parseInt(a.year) || 0;
                 const yearB = parseInt(b.year) || 0;
                 // Secundaria por fecha de actualización si el año es igual
                 if (yearA === yearB) return (b.updatedAt || 0) - (a.updatedAt || 0);
                 return yearB - yearA;
               }),
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

  // Mark tab as visited on switch (lazy-mount tracking)
  const handleSetTab = useCallback((tab: string) => {
    // 'live' abre una pantalla completa del stack (react-native-video no puede vivir inline)
    if (tab === 'live') {
      navigation.navigate('ChocopopPlayerTV');
      return;
    }
    visitedTabs.current.add(tab);
    setCurrentTab(tab);
  }, [navigation]);

  // ─── Renderizado por tab ───────────────────────────────────────────────────
  const renderContent = () => {
    if (currentTab === 'search') return <TvSearchScreen />;
    if (currentTab === 'mylist') return <TvMyListScreen />;
    if (currentTab === 'discover') return <TvDiscoverScreen currentTab={currentTab} />;
    if (currentTab === 'profile') return <TvUserProfileScreen currentTab={currentTab} />;
    // 'live' siempre navega al stack — no tiene render inline

    // ─── HOME ──────────────────────────────────────────────────────────────
    return (
      <View style={{ flex: 1 }}>
        <FlatList
          ref={flatListRef}
          data={contentRows}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          contentContainerStyle={{ paddingBottom: 60 }}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          windowSize={5}
          removeClippedSubviews={true}
          onEndReached={fetchMoreContent}
          onEndReachedThreshold={0.5}

          ListHeaderComponent={
            <View style={{ marginBottom: 40, paddingTop: 70 }}>
              {/* ── HERO BANNER ───────────────────── */}
              {activeHeroItem && (
                <View style={{ width: '100%', height: windowHeight * 0.75, backgroundColor: '#050505' }} pointerEvents="box-none">
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
                  <View style={{ position: 'absolute', bottom: 120, left: 60, width: '55%' }} pointerEvents="none">
                    {/* Metadata */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                      <View style={{ borderLeftWidth: 3, borderLeftColor: '#b6a0ff', paddingLeft: 8 }}>
                        <Text style={{ color: '#b6a0ff', fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' }}>
                          {activeHeroItem.type === 'movie' ? 'FEATURE FILM' : activeHeroItem.type === 'series' ? 'ORIGINAL SERIES' : 'ANIME EVENT'}
                        </Text>
                      </View>
                      {activeHeroItem.year && (
                        <Text style={{ color: '#aaaab7', fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>{activeHeroItem.year}</Text>
                      )}
                      {activeHeroItem.rating && (
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                          <Text style={{ color: '#00e3fd', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>RATING {activeHeroItem.rating}</Text>
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
                    <Text numberOfLines={3} style={{ color: '#D1D5DB', fontSize: 16, marginBottom: 16, lineHeight: 24, fontWeight: '500', maxWidth: '90%' }}>
                      {activeHeroItem.description}
                    </Text>
                  </View>

                  {/* Botones de acción - FUERA de pointerEvents=none, en flow normal para recibir foco */}
                  <View style={{ position: 'absolute', bottom: 40, left: 60, flexDirection: 'row', alignItems: 'center' }}>
                    <PremiumHeroButton
                      title="WATCH NOW" isPrimary={true}
                      onPress={() => {
                        lastInteractionTime.current = Date.now();
                        navigation.navigate('DetailTV', { item: activeHeroItem });
                      }}
                      hasTVPreferredFocus={true}
                    />
                    <PremiumHeroButton
                      title="EXPLORE DETAILS" isPrimary={false}
                      onPress={() => {
                        lastInteractionTime.current = Date.now();
                        navigation.navigate('DetailTV', { item: activeHeroItem });
                      }}
                    />
                  </View>

                  {/* Indicadores del carrusel */}
                  {featuredItems.length > 1 && (
                    <View style={{ position: 'absolute', bottom: 16, left: 60, flexDirection: 'row', alignItems: 'center', gap: 6 }} pointerEvents="none">
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

              {/* ── BANNER TV EN VIVO ──────────────────────── */}
              <TvLiveSectionBanner onOpenLiveTab={() => handleSetTab('live')} />

              {/* ── EVENTOS CHOCOPOPFLOW ───────────────────────────── */}
              <TvChocopopSection />
            </View>
          }
          renderItem={({ item: row }) => (
            <ContentRowView
              key={row.id}
              row={row}
              onEndReached={fetchMoreContent}
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
    <View style={{ flex: 1, backgroundColor: '#0c0e17', flexDirection: 'column' }}>

      {/* TOPBAR EN NORMAL FLOW (Ahora es toda la navegación superior) */}
      <View style={{ zIndex: 100, width: '100%', position: 'absolute', top: 0, left: 0, right: 0 }} ref={topBarNodeId}>
        <TvTopBar currentTab={currentTab} setCurrentTab={handleSetTab} forceFocus={forceFocusTopBar} />
      </View>

      {/* CONTENIDO PRINCIPAL */}
      <View style={{ flex: 1, zIndex: 10 }}>
        {renderContent()}
      </View>

    </View>
  );
}
