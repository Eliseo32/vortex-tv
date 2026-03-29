import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Image, Dimensions, Modal, FlatList, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';
import { LinearGradient } from 'expo-linear-gradient';

const { height: windowHeight } = Dimensions.get('window');

// ─── Botón "Glassmorphic" sin íconos, pura tipografía moderna ────────────────
const GlassButton = ({ title, onPress, isPrimary = false }: any) => (
  <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.08} style={{ borderRadius: 8, marginRight: 16, marginBottom: 12 }}>
    {(focused: boolean) => (
      <View style={[
        { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 8, borderWidth: 2 },
        isPrimary 
          ? { backgroundColor: focused ? '#fff' : 'rgba(176,38,255,0.2)', borderColor: focused ? '#fff' : '#B026FF' }
          : { backgroundColor: focused ? '#fff' : 'rgba(255,255,255,0.05)', borderColor: focused ? '#fff' : 'rgba(255,255,255,0.1)' }
      ]}>
        <Text style={{ 
          fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, 
          color: isPrimary ? (focused ? '#000' : '#B026FF') : (focused ? '#000' : '#fff') 
        }}>
          {title}
        </Text>
      </View>
    )}
  </TvFocusable>
);

export default function TvDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const item = route.params?.item;
  const { toggleMyList, isInMyList, markAsWatched, isWatched, addToHistory } = useAppStore();

  const [showServerModal, setShowServerModal] = useState(false);
  const [actionType, setActionType] = useState<'play' | 'party' | null>('play');
  
  const isSeries = item?.type === 'series' || item?.type === 'anime';
  const isLiveTV = item?.type === 'tv';
  const hasSeasons = isSeries && item?.seasonsData && item.seasonsData.length > 0;

  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  useEffect(() => {
    if (route.params?.season && route.params?.episode) {
      setSelectedSeason(route.params.season);
      setSelectedEpisode(route.params.episode);
    } else if (hasSeasons) {
      setSelectedSeason(item.seasonsData[0].season);
    }
  }, [item, route.params]);

  if (!item) return <View style={{ flex: 1, backgroundColor: '#050505' }} />;
  const isSaved = isInMyList(item.id);
  
  const currentSeasonData = item.seasonsData?.find((s: any) => s.season === selectedSeason);
  const episodesArray = Array.from({ length: currentSeasonData?.episodes || 0 }, (_, i) => i + 1);

  // ─── Funciones de Lógica de Reproducción ──────────────────────────────────
  const getServersForEpisode = (season: number, ep: number) => {
    if (isSeries && item.tmdb_id) {
      const linksData = item.episodeLinks && item.episodeLinks[`${season}-${ep}`];
      if (linksData) {
        return Array.isArray(linksData) 
          ? linksData.map((l, i) => typeof l === 'string' ? { name: `SERVIDOR ${i + 1}`, url: l } : l) 
          : [{ name: 'SERVIDOR PREMIUM', url: linksData }];
      }
      return [];
    }
    const movieServers = item.servers && item.servers.length > 0 ? item.servers : (item.videoUrl ? [{ name: 'SERVIDOR PRINCIPAL', url: item.videoUrl }] : []);
    return movieServers.map((srv: any, i: number) => typeof srv === 'string' ? { name: `SERVIDOR ${i + 1}`, url: srv } : srv);
  };

  const directPlayEpisode = (season: number, ep: number) => {
    setSelectedEpisode(ep);
    const servers = getServersForEpisode(season, ep);
    if (servers.length === 0) return;
    
    // Marcar como visto ANTES de navegar inmediatamente
    markAsWatched(`${item.id}-s${season}-e${ep}`);
    addToHistory(item, season, ep);

    navigation.navigate('PlayerTV', {
      videoUrl: servers[0].url,
      title: `${item.title} - T${season} E${ep}`,
      seriesItem: item,
      season,
      episode: ep,
    });
  };

  const handleMainPlay = () => {
    if (isSeries) {
      directPlayEpisode(selectedSeason, selectedEpisode);
    } else {
      const servers = getServersForEpisode(1, 1);
      if (servers.length === 0) return;
      addToHistory(item);
      if (item.genre === 'Deportes') {
        navigation.navigate('SportsPlayerTV', { item });
      } else {
        navigation.navigate('PlayerTV', { videoUrl: servers[0].url, title: item.title });
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#050505' }}>
      
      {/* 🌌 FONDO RADICAL MINIMALISTA (Ambilight Neon) */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {/* Imagen desenfocada para crear textura cinemática de fondo */}
        <Image 
          source={{ uri: item.backdrop || item.poster }} 
          style={{ width: '100%', height: '100%', position: 'absolute' }} 
          resizeMode="cover" 
          blurRadius={60}
        />
        
        {/* Capa de luz neón base sutil */}
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(176,38,255,0.06)' }} />
        
        {/* Oscurecimiento profundo (Background sólido oscuro en vez de fotográfico) */}
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,5,0.75)' }} />

        {/* Gradiente inferior suave para fundido con el resto de la pantalla */}
        <LinearGradient
            colors={['transparent', '#050505']}
            start={{ x: 0, y: 0.5 }} end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* Botón Flotante para VOLVER, minimalista y transparente */}
      <View style={{ position: 'absolute', top: 40, left: 60, zIndex: 50 }}>
        <TvFocusable onPress={() => navigation.goBack()} borderWidth={0} scaleTo={1.1} style={{ borderRadius: 999 }}>
          {(focused: boolean) => (
            <View style={{
              width: 50, height: 50, borderRadius: 25,
              backgroundColor: focused ? '#fff' : 'rgba(255,255,255,0.1)',
              borderColor: focused ? '#fff' : 'rgba(255,255,255,0.3)', borderWidth: 1,
              alignItems: 'center', justifyContent: 'center'
            }}>
              <Text style={{ 
                color: focused ? '#000' : '#fff', fontWeight: '900', fontSize: 24,
                transform: [{ translateY: -2 }]
              }}>
                ‹
              </Text>
            </View>
          )}
        </TvFocusable>
      </View>

      <ScrollView 
        style={{ flex: 1, zIndex: 10 }} 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        
        {/* 📋 SECCIÓN HERO (Split Layout Clásico) */}
        <View style={{ flexDirection: 'row', paddingTop: windowHeight * 0.12, paddingHorizontal: 70, minHeight: windowHeight * 0.65 }}>
          
          {/* PANEL IZQUIERDO: Textos e info */}
          <View style={{ flex: 1, paddingRight: 40, justifyContent: 'center' }}>
            
            {/* TÍTULO GIGANTE ESCALADO A TV (Max 54dp) */}
            <Text numberOfLines={2} style={{ 
              color: '#fff', fontSize: 54, fontWeight: '900', letterSpacing: -1, 
              lineHeight: 58, marginBottom: 12, textShadowColor: 'rgba(0,0,0,0.9)', 
              textShadowOffset: { width: 0, height: 6 }, textShadowRadius: 20,
            }}>
              {(item.title || item.name || '').toUpperCase()}
            </Text>

            {/* METADATA ESENCIAL */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 2 }}>
                {item.year || '2024'}
              </Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#B026FF' }}/>
              <Text style={{ color: '#9CA3AF', fontSize: 16, fontWeight: '800', letterSpacing: 2 }}>
                IMDb {item.rating || '9.4'}
              </Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#B026FF' }}/>
              <View style={{ borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>4K HDR</Text>
              </View>
            </View>

            {/* SINOPSIS CORTA (3 líneas) */}
            <Text numberOfLines={3} style={{ 
              color: '#D1D5DB', fontSize: 16, fontWeight: '500', lineHeight: 28, 
              marginBottom: 32, letterSpacing: 0.5,
              textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 10
            }}>
              {item.description}
            </Text>

            {/* BOTONES */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <GlassButton title={isSeries ? "REPRODUCIR EP" : "REPRODUCIR"} isPrimary={true} onPress={handleMainPlay} />
              <GlassButton title={isSaved ? "EN LISTA" : "MI LISTA"} onPress={() => toggleMyList(item.id)} />
              {!isLiveTV && <GlassButton title="PARTY" onPress={() => { setActionType('party'); setShowServerModal(true); }} />}
              {!isLiveTV && <GlassButton title="SERVIDORES" onPress={() => { setActionType('play'); setShowServerModal(true); }} />}
            </View>
          </View>

          {/* PANEL DERECHO: El Póster Físico Premium */}
          <View style={{ justifyContent: 'center', alignItems: 'flex-end', width: 280 }}>
             <View style={{
                width: 240, height: 360, borderRadius: 14, overflow: 'hidden',
                borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
                shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.8, shadowRadius: 30, elevation: 15
             }}>
               <Image source={{ uri: item.poster }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
             </View>
          </View>

        </View>

        {/* 🎬 EPISODIOS (Ultra-Wide Edge-to-Edge Cards) */}
        {hasSeasons && (
          <View style={{ marginTop: 20 }}>
            {/* Títulos de Temporadas estilo Tags minimalistas */}
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={item.seasonsData} keyExtractor={(s: any) => s.season.toString()} 
              contentContainerStyle={{ paddingLeft: 70, marginBottom: 32 }}
              renderItem={({ item: s }: any) => (
                <TvFocusable onPress={() => setSelectedSeason(s.season)} borderWidth={0} style={{ borderRadius: 6, marginRight: 32 }}>
                  {(focused: boolean) => (
                    <View style={{ paddingBottom: 8, borderBottomWidth: 4, borderBottomColor: focused ? '#B026FF' : (selectedSeason === s.season ? '#fff' : 'transparent') }}>
                      <Text style={{ 
                        fontWeight: '900', fontSize: 20, textTransform: 'uppercase', letterSpacing: 4,
                        color: focused ? '#B026FF' : (selectedSeason === s.season ? '#fff' : '#6B7280') 
                      }}>
                        TEMPORADA {s.season}
                      </Text>
                    </View>
                  )}
                </TvFocusable>
              )}
            />

            {/* Fila Horizontal de Episodios Extra Anchos */}
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={episodesArray} keyExtractor={(ep) => ep.toString()}
              contentContainerStyle={{ paddingLeft: 70, paddingRight: 70, paddingBottom: 40 }}
              renderItem={({ item: epNum }) => {
                const isEpWatched = isWatched(`${item.id}-s${selectedSeason}-e${epNum}`);
                return (
                  <TvFocusable onPress={() => directPlayEpisode(selectedSeason, epNum)} borderWidth={0} scaleTo={1.04} style={{ borderRadius: 14, marginRight: 40 }}>
                    {(focused: boolean) => (
                      <View style={{
                        width: 280, height: 157, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0a0a0a',
                        borderWidth: 2, borderColor: focused ? '#B026FF' : 'rgba(255,255,255,0.05)',
                        elevation: focused ? 15 : 0, shadowColor: '#B026FF', shadowOpacity: focused ? 0.3 : 0, shadowRadius: 15
                      }}>
                        {/* Imágen estirada: opaca sin blur si está en foco */}
                        <Image 
                          source={{ uri: item.backdrop || item.poster }} 
                          style={{ ...StyleSheet.absoluteFillObject, opacity: focused ? 0.8 : 0.3 }} 
                          blurRadius={focused ? 0 : 5} 
                        />
                        
                        {/* Overlay Neon Fuchsia al Enfocar */}
                        {focused && <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(176,38,255,0.15)' }} />}
                        
                        <LinearGradient 
                          colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.95)']} 
                          start={{ x: 0, y: 0.3 }} end={{ x: 0, y: 1 }} 
                          style={StyleSheet.absoluteFillObject} 
                        />
                        
                        <View style={{ position: 'absolute', bottom: 16, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                          <Text style={{ fontWeight: '900', fontSize: 26, color: focused ? '#fff' : '#e5e7eb', letterSpacing: 2 }}>
                            EP {epNum.toString().padStart(2, '0')}
                          </Text>
                          {isEpWatched && (
                            <Text style={{ fontWeight: '900', fontSize: 11, color: '#4ade80', letterSpacing: 2 }}>
                              VISTO
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                  </TvFocusable>
                );
              }}
            />
          </View>
        )}
      </ScrollView>

      {/* MODAL SERVIDORES MINIMALISTA */}
      <Modal visible={showServerModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(5,5,5,0.98)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 600, maxHeight: windowHeight * 0.8, backgroundColor: '#0a0a0a', borderRadius: 24, padding: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', marginBottom: 30, letterSpacing: 3 }}>
              {actionType === 'party' ? 'VORTEX PARTY' : 'ELEGIR SERVIDOR'}
            </Text>
            
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {getServersForEpisode(selectedSeason, selectedEpisode).map((srv: any, idx: number) => (
                <TvFocusable key={idx} onPress={() => {
                  setShowServerModal(false);
                  if (actionType === 'play') {
                    if (item.genre === 'Deportes') navigation.navigate('SportsPlayerTV', { item: { ...item, videoUrl: srv.url } });
                    else navigation.navigate('PlayerTV', { videoUrl: srv.url, title: item.title });
                  } else {
                    navigation.navigate('PartySetup', { item, title: item.title, backdrop: item.backdrop, selectedVideoUrl: srv.url });
                  }
                }} borderWidth={0} style={{ borderRadius: 8, marginBottom: 16 }}>
                  {(focused: boolean) => (
                    <View style={{
                      padding: 24, borderRadius: 8, borderWidth: 2,
                      borderColor: focused ? '#B026FF' : 'rgba(255,255,255,0.08)',
                      backgroundColor: focused ? 'rgba(176,38,255,0.1)' : 'transparent',
                      alignItems: 'center'
                    }}>
                      <Text style={{ fontWeight: '900', fontSize: 18, color: focused ? '#fff' : '#9CA3AF', letterSpacing: 3, textTransform: 'uppercase' }}>
                        {srv.name}
                      </Text>
                    </View>
                  )}
                </TvFocusable>
              ))}

              <View style={{ marginTop: 20 }}>
                <TvFocusable onPress={() => setShowServerModal(false)} borderWidth={0} style={{ borderRadius: 8 }}>
                  {(focused: boolean) => (
                    <View style={{
                      padding: 24, borderRadius: 8, borderWidth: 2,
                      borderColor: focused ? '#ef4444' : 'rgba(255,255,255,0.1)',
                      backgroundColor: focused ? 'rgba(239,68,68,0.1)' : 'transparent',
                      alignItems: 'center'
                    }}>
                      <Text style={{ fontWeight: '900', fontSize: 18, color: focused ? '#ef4444' : '#fff', letterSpacing: 3 }}>
                        CERRAR
                      </Text>
                    </View>
                  )}
                </TvFocusable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}