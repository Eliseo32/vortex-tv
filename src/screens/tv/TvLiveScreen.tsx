import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, FlatList, Image, Dimensions, Animated, StyleSheet, BackHandler } from 'react-native';
import { Play, Tv } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';
import TvMovieCard from '../../components/tv/TvMovieCard';

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

interface TvLiveScreenProps {
  category?: string;
}

// ─── Mapa de etiquetas por genre ────────────────────────────────────────────
const GENRE_LABEL: Record<string, string> = {
  Nacional: 'Canales Nacionales',
  Deportes: 'Canales de Deporte',
  Noticias: 'Noticias',
  Entretenimiento: 'Entretenimiento',
  Internacional: 'Internacionales',
  Infantil: 'Infantil',
  Musica: 'Música',
  Peliculas: 'Películas & Cine',
};

function getLabelForGenre(genre: string): string {
  return GENRE_LABEL[genre] || genre;
}

// ─── Vista agrupada para canales TV ─────────────────────────────────────────
function TvChannelsGroupedView({ channels }: { channels: any[] }) {
  const navigation = useNavigation<any>();

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    channels.forEach((item) => {
      const key = item.genre || 'Otros';
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });

    // Orden preferido
    const preferredOrder = ['Nacional', 'Deportes', 'Noticias', 'Entretenimiento', 'Internacional', 'Musica', 'Peliculas', 'Infantil'];
    const sorted = Object.keys(map).sort((a, b) => {
      const ai = preferredOrder.indexOf(a);
      const bi = preferredOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return sorted.map((key) => ({ genre: key, items: map[key] }));
  }, [channels]);

  if (channels.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 }}>
        <Tv color="#9CA3AF" size={56} strokeWidth={1.5} />
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 20 }}>Sin canales disponibles</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={groups}
      keyExtractor={(_, idx) => idx.toString()}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 120, paddingBottom: 200 }}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingLeft: 64, marginTop: 8 }}>
          <Tv color="#FACC15" size={26} strokeWidth={2} />
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginLeft: 12 }}>
            TV en Vivo
          </Text>
        </View>
      }
      renderItem={({ item: group }) => (
        <View style={{ marginBottom: 32 }}>
          {/* Título del grupo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingLeft: 64 }}>
            <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: '#FACC15', marginRight: 10 }} />
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.4 }}>
              {getLabelForGenre(group.genre)}
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 14, marginLeft: 10, fontWeight: '600' }}>
              {group.items.length} canales
            </Text>
          </View>

          {/* Lista horizontal */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={group.items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 56, paddingBottom: 8 }}
            renderItem={({ item }) => (
              <TvFocusable
                onPress={() => navigation.navigate('DetailTV', { item })}
                borderWidth={0}
                scaleTo={1.08}
                style={{ borderRadius: 12, marginRight: 14 }}
                focusedStyle={{ backgroundColor: 'transparent' }}
              >
                {(focused: boolean) => (
                  <View style={{
                    width: 180, borderRadius: 12, overflow: 'hidden',
                    borderWidth: focused ? 2 : 1,
                    borderColor: focused ? '#FACC15' : 'rgba(255,255,255,0.08)',
                    backgroundColor: '#111',
                  }}>
                    {/* Imagen */}
                    <View style={{ width: '100%', height: 110, backgroundColor: '#1a1a1a' }}>
                      {item.poster ? (
                        <Image
                          source={{ uri: item.poster }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Tv color="#FACC15" size={34} strokeWidth={1.5} />
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
                    {/* Info */}
                    <View style={{ padding: 10 }}>
                      <Text numberOfLines={1} style={{
                        color: focused ? '#FACC15' : '#fff',
                        fontSize: 13, fontWeight: '800', letterSpacing: 0.3,
                      }}>
                        {item.title}
                      </Text>
                      {item.genre ? (
                        <Text numberOfLines={1} style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
                          {getLabelForGenre(item.genre)}
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
  );
}

// ─── Pantalla principal ──────────────────────────────────────────────────────
export default function TvLiveScreen({ category = 'movie' }: TvLiveScreenProps) {
  const navigation = useNavigation<any>();
  const { cloudContent } = useAppStore();

  const flatListRef = useRef<FlatList>(null);
  const scrollOffset = useRef(0);

  const [activeHeroItem, setActiveHeroItem] = useState<any>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const heroFadeAnim = useRef(new Animated.Value(1)).current;

  // Todo el contenido de la categoría seleccionada
  const filteredContent = useMemo(
    () => cloudContent.filter((item) => item.type === category),
    [cloudContent, category],
  );

  const heroItems = useMemo(() => filteredContent.slice(0, 5), [filteredContent]);

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

  const handleScroll = (event: any) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  };

  useEffect(() => {
    if (heroItems.length > 0) setActiveHeroItem(heroItems[0]);
    setCarouselIndex(0);
  }, [heroItems]);

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

  // ─── Si es TV en Vivo → vista agrupada ──────────────────────────────────────
  if (category === 'tv') {
    return (
      <View style={{ flex: 1, backgroundColor: '#050505' }}>
        <View style={{ ...StyleSheet.absoluteFillObject, overflow: 'visible' }} pointerEvents="none">
          <View style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: windowHeight * 0.4,
            backgroundColor: 'transparent',
            borderTopWidth: windowHeight * 0.4,
            borderColor: 'rgba(250, 204, 21, 0.07)',
            borderLeftWidth: windowWidth,
            borderLeftColor: 'transparent',
            opacity: 0.9,
          }} />
        </View>
        <TvChannelsGroupedView channels={filteredContent} />
      </View>
    );
  }

  // ─── Vista grilla para Películas, Series, Anime ──────────────────────────────
  const categoryLabel: Record<string, string> = {
    movie: 'Películas',
    series: 'Series',
    anime: 'Anime',
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#050505' }}>
      {/* 🔮 Fondo premium */}
      <View style={{ ...StyleSheet.absoluteFillObject, overflow: 'visible' }} pointerEvents="none">
        <View style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: windowHeight * 0.4,
          backgroundColor: 'transparent',
          borderTopWidth: windowHeight * 0.4,
          borderColor: 'rgba(250, 204, 21, 0.08)',
          borderLeftWidth: windowWidth,
          borderLeftColor: 'transparent',
          opacity: 0.8,
        }} />
        <View style={{ position: 'absolute', bottom: 0, width: '100%', height: '66%', backgroundColor: 'rgba(0,0,0,0.5)' }} />
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          ref={flatListRef}
          key={category}
          data={filteredContent}
          keyExtractor={(item) => item.id}
          numColumns={6}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 52, paddingBottom: 200, paddingTop: 120 }}

          ListHeaderComponent={
            <View>
              {/* Título */}
              <View style={{ marginBottom: 16, paddingLeft: 4, marginTop: 4 }}>
                <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.5 }}>
                  {categoryLabel[category] || 'Explorar'}
                </Text>
              </View>

              {/* Hero Carousel */}
              {activeHeroItem ? (
                <View style={{
                  height: windowHeight * 0.40, marginBottom: 30, borderRadius: 16,
                  overflow: 'hidden', marginHorizontal: 12, position: 'relative',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: '#111',
                }}>
                  <Animated.Image
                    key={activeHeroItem.id}
                    source={{ uri: activeHeroItem.backdrop || activeHeroItem.poster }}
                    style={[{ width: '100%', height: '100%', position: 'absolute' }, { opacity: heroFadeAnim }]}
                    resizeMode="cover"
                  />
                  <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,5,0.35)' }} />
                  <View style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: '60%',
                    backgroundColor: 'rgba(5,5,5,0.72)',
                  }} />

                  <Animated.View style={{ position: 'absolute', bottom: 20, left: 30, width: '60%', opacity: heroFadeAnim }}>
                    <View style={{
                      backgroundColor: 'rgba(250,204,21,0.15)', paddingHorizontal: 8, paddingVertical: 4,
                      borderRadius: 6, borderWidth: 1, borderColor: 'rgba(250,204,21,0.3)',
                      alignSelf: 'flex-start', marginBottom: 8,
                    }}>
                      <Text style={{ color: '#FACC15', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                        Últimos Agregados
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={{
                      color: '#fff', fontSize: 30, fontWeight: '900', marginBottom: 8, letterSpacing: -0.5,
                      textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8,
                    }}>
                      {activeHeroItem.title}
                    </Text>
                    <Text numberOfLines={2} style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 16, lineHeight: 20 }}>
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
                          backgroundColor: focused ? '#fff' : '#FACC15',
                        }}>
                          <Play color="#000" size={15} fill="#000" />
                          <Text style={{ color: '#000', fontWeight: '900', fontSize: 13, marginLeft: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                            Ver Ahora
                          </Text>
                        </View>
                      )}
                    </TvFocusable>

                    {heroItems.length > 1 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
                        {heroItems.map((_, idx) => (
                          <View key={idx} style={{
                            height: 4, borderRadius: 2, marginRight: 6,
                            width: idx === carouselIndex ? 32 : 10,
                            backgroundColor: idx === carouselIndex ? '#FACC15' : 'rgba(255,255,255,0.3)',
                          }} />
                        ))}
                      </View>
                    )}
                  </Animated.View>
                </View>
              ) : <View style={{ marginTop: 16 }} />}
            </View>
          }
          renderItem={({ item }) => (
            <TvMovieCard item={item} onPress={() => navigation.navigate('DetailTV', { item })} />
          )}
        />
      </View>
    </View>
  );
}