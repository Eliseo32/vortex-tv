import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, FlatList, Image, Dimensions, Animated, StyleSheet, BackHandler, Modal } from 'react-native';
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
  Regional: 'Canales Regionales',
};

function getLabelForGenre(genre: string): string {
  return GENRE_LABEL[genre] || genre;
}

// ─── Vista Vertical "EPG Simulado" ──────────────────────────────────────────
function TvChannelsVerticalGrid({ channels }: { channels: any[] }) {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<string>('Todos');
  const [selectedChannel, setSelectedChannel] = useState<any>(null);
  const [showServerModal, setShowServerModal] = useState(false);

  // Extraer géneros únicos presentes en esta carga
  const availableTabs = useMemo(() => {
    const tabs = new Set<string>();
    channels.forEach(ch => {
      if (ch.genre) tabs.add(ch.genre);
    });
    // Ordenar con Deportes y Películas de primeros
    const preferred = ['Deportes', 'Peliculas', 'Nacional', 'Noticias', 'Entretenimiento'];
    const sorted = Array.from(tabs).sort((a, b) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return ['Todos', ...sorted];
  }, [channels]);

  // Filtrar base
  const displayedChannels = useMemo(() => {
    if (activeTab === 'Todos') return channels;
    return channels.filter(c => c.genre === activeTab);
  }, [channels, activeTab]);

  if (channels.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 }}>
        <Tv color="#9CA3AF" size={56} strokeWidth={1.5} />
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 20 }}>Sin canales disponibles</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: 100 }}>
      {/* Header y Filtros (Tabs) */}
      <View style={{ marginBottom: 16, paddingHorizontal: 64 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <Tv color="#FACC15" size={26} strokeWidth={2} />
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginLeft: 12 }}>
            TV en Vivo
          </Text>
        </View>

        {/* Horizontal Tabs */}
        <Animated.FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={availableTabs}
          keyExtractor={(t) => t}
          contentContainerStyle={{ paddingBottom: 10 }}
          renderItem={({ item }) => {
            const isActive = activeTab === item;
            return (
              <TvFocusable
                onPress={() => setActiveTab(item)}
                borderWidth={0}
                scaleTo={1.05}
                style={{ borderRadius: 20, marginRight: 12 }}
                focusedStyle={{ backgroundColor: 'transparent' }}
              >
                {(focused: boolean) => (
                  <View style={{
                    paddingHorizontal: 20, paddingVertical: 10,
                    borderRadius: 20,
                    backgroundColor: isActive ? '#fff' : (focused ? '#333' : '#1a1a1a'),
                    borderWidth: focused ? 2 : 1,
                    borderColor: focused ? '#FACC15' : 'transparent'
                  }}>
                    <Text style={{
                      color: isActive ? '#000' : '#fff',
                      fontWeight: '800', fontSize: 14
                    }}>
                      {item === 'Todos' ? 'Todos' : getLabelForGenre(item)}
                    </Text>
                  </View>
                )}
              </TvFocusable>
            );
          }}
        />
      </View>

      {/* Grid Vertical Principal */}
      <FlatList
        data={displayedChannels}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 64, paddingBottom: 200 }}
        windowSize={5}
        removeClippedSubviews={true}
        initialNumToRender={8}
        maxToRenderPerBatch={5}
        getItemLayout={(_data, index) => ({ length: 88, offset: 88 * index, index })}
        renderItem={({ item, index }) => (
          <TvFocusable
            onPress={() => {
              // Ir directo al reproductor con la URL del canal
              const url = item.videoUrl || '';
              if (url) {
                // Si el canal tiene DRM keys, usar reproductor nativo
                const hasDrm = url.includes('drmKeyId=') && url.includes('drmKey=');
                if (hasDrm) {
                  navigation.navigate('DrmPlayerTV', { videoUrl: url });
                } else {
                  navigation.navigate('PlayerTV', { videoUrl: url });
                }
              }
            }}
            borderWidth={0}
            scaleTo={1.02}
            style={{ marginBottom: 8, borderRadius: 12 }}
            focusedStyle={{ backgroundColor: 'transparent' }}
          >
            {(focused: boolean) => (
              <View style={{
                flexDirection: 'row',
                height: 80,
                borderRadius: 12,
                backgroundColor: focused ? '#18181b' : '#0f0f12',
                borderWidth: focused ? 2 : 1,
                borderColor: focused ? '#FACC15' : 'rgba(255,255,255,0.05)',
                overflow: 'hidden'
              }}>
                {/* Lado Izquierdo: Número y Logo */}
                <View style={{
                  width: '25%',
                  backgroundColor: focused ? '#27272a' : '#141417',
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 16,
                  borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.05)'
                }}>
                  <Text style={{ color: '#52525b', fontSize: 18, fontWeight: '900', width: 40 }}>
                    {index + 1}
                  </Text>

                  {item.poster && item.poster.trim().length > 0 ? (
                    <Image
                      source={{ uri: item.poster }}
                      style={{ width: 60, height: 40, borderRadius: 6 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={{ width: 60, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#222', borderRadius: 6 }}>
                      <Tv color="#FACC15" size={20} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text numberOfLines={1} style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                      {item.title}
                    </Text>
                    {item.genre && (
                      <Text numberOfLines={1} style={{ color: '#71717a', fontSize: 11, fontWeight: '600' }}>
                        {getLabelForGenre(item.genre)}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Lado Derecho: Simulación EPG ("Ahora") */}
                <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444', marginRight: 8 }} />
                    <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>EN VIVO</Text>
                  </View>
                  <Text numberOfLines={1} style={{ color: focused ? '#FACC15' : '#e4e4e7', fontSize: 16, fontWeight: '800' }}>
                    Transmisión en Directo
                  </Text>
                  <Text numberOfLines={1} style={{ color: '#a1a1aa', fontSize: 13, marginTop: 4 }}>
                    Disfrutando de la grilla de {item.title}
                  </Text>
                </View>
              </View>
            )}
          </TvFocusable>
        )}
      />

      {/* MODAL DE SERVIDORES (EPG) */}
      <Modal visible={showServerModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: 500, backgroundColor: '#0f0f12', borderRadius: 24, padding: 32,
            borderWidth: 2, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.8, shadowRadius: 20, elevation: 20
          }}>
            <Tv color="#FACC15" size={48} />
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 16, marginBottom: 8, textAlign: 'center' }}>
              {selectedChannel?.title || 'Canal en Vivo'}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 15, marginBottom: 32, textAlign: 'center' }}>
              Selecciona el servidor o formato de transmisión deseado
            </Text>

            <FlatList
              data={(selectedChannel?.servers || selectedChannel?.options || [{ name: 'Señal Default', url: selectedChannel?.videoUrl }])}
              keyExtractor={(_, i) => i.toString()}
              style={{ width: '100%', maxHeight: 300 }}
              renderItem={({ item: srv, index }) => (
                <TvFocusable
                  onPress={() => {
                    setShowServerModal(false);
                    // Navega al reproductor inyectando el videoUrl seleccionado
                    navigation.navigate('DetailTV', {
                      item: { ...selectedChannel, videoUrl: srv.url || srv.iframe || srv }
                    });
                  }}
                  scaleTo={1.05}
                  style={{ marginBottom: 12, borderRadius: 12 }}
                  focusedStyle={{ backgroundColor: 'transparent' }}
                >
                  {(focused) => (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: focused ? '#FACC15' : '#18181b',
                      paddingVertical: 16, borderRadius: 12, borderWidth: 1,
                      borderColor: focused ? '#FACC15' : 'rgba(255,255,255,0.1)'
                    }}>
                      <Play color={focused ? "#000" : "#FACC15"} size={20} fill={focused ? "#000" : "transparent"} />
                      <Text style={{
                        color: focused ? '#000' : '#fff', fontSize: 16, fontWeight: '800', marginLeft: 12, letterSpacing: 1
                      }}>
                        {srv.name || `Opción ${index + 1}`}
                      </Text>
                    </View>
                  )}
                </TvFocusable>
              )}
            />

            <TvFocusable
              onPress={() => setShowServerModal(false)}
              scaleTo={1.05}
              style={{ marginTop: 24, borderRadius: 12, width: '100%' }}
              focusedStyle={{ backgroundColor: 'transparent' }}
            >
              {(f) => (
                <View style={{
                  backgroundColor: f ? '#ef4444' : 'transparent', borderWidth: 1, borderColor: f ? '#ef4444' : 'rgba(255,255,255,0.2)',
                  paddingVertical: 16, borderRadius: 12, alignItems: 'center'
                }}>
                  <Text style={{ color: f ? '#fff' : '#a1a1aa', fontSize: 16, fontWeight: '700', letterSpacing: 1 }}>Cerrar</Text>
                </View>
              )}
            </TvFocusable>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Pantalla principal ──────────────────────────────────────────────────────
export default function TvLiveScreen({ category = 'movie' }: TvLiveScreenProps) {
  const navigation = useNavigation<any>();
  const { cloudContent, channelFolders } = useAppStore();

  const flatListRef = useRef<FlatList>(null);
  const scrollOffset = useRef(0);

  const [activeHeroItem, setActiveHeroItem] = useState<any>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const heroFadeAnim = useRef(new Animated.Value(1)).current;

  // Todo el contenido de la categoría seleccionada unida con las carpetas de canales M3U8
  const filteredContent = useMemo(() => {
    const baseContent = cloudContent.filter((item) => item.type === category);

    if (category === 'tv') {
      const dynamicFolderChannels: any[] = [];
      channelFolders.forEach(folder => {
        folder.options.forEach((opt: any, i: number) => {
          dynamicFolderChannels.push({
            id: `${folder.id}-opt-${i}`,
            title: opt.name,
            type: 'tv',
            genre: folder.name,
            poster: folder.logo || opt.logo || 'https://via.placeholder.com/300x169/222222/cccccc?text=TV',
            backdrop: folder.logo || opt.logo || '',
            videoUrl: opt.iframe,
            description: `${folder.name} en directo`,
            year: 'LIVE',
            rating: ''
          });
        });
      });
      return [...baseContent, ...dynamicFolderChannels];
    }

    return baseContent;
  }, [cloudContent, channelFolders, category]);

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

  // ─── Si es TV en Vivo → vista "EPG Simulado Vertical" ─────────────────────
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
        <TvChannelsVerticalGrid channels={filteredContent} />
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