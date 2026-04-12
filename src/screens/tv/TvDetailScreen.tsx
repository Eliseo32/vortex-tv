import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Image, Dimensions, Modal, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';
import { LinearGradient } from 'expo-linear-gradient';

// ── Cuevana on-demand link fetcher ────────────────────────────────────────────
const CUEVANA_HEADERS = {
  'Referer': 'https://cuevana.gs/',
  'Origin': 'https://cuevana.gs',
  'Accept': 'application/json, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
};

function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  // AbortSignal.timeout() no disponible en Hermes → usamos AbortController manual
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { headers: CUEVANA_HEADERS, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function fetchCuevanaLinks(postId: string): Promise<{ name: string; url: string; server?: string }[]> {
  try {
    const res = await fetchWithTimeout(`https://cuevana.gs/wp-api/v1/player?postId=${postId}&demo=0`);
    if (!res.ok) return [];
    const data = await res.json();
    const embeds: any[] = data?.data?.embeds || [];
    const servers = embeds
      .filter((e: any) => e.url && e.url.includes('cuevana.gs/player.php'))
      .map((e: any) => {
        // e.server siempre es "Online" (genérico) — el nombre real está en la URL
        // https://cuevana.gs/player.php?t=TOKEN&server=vimeos → "vimeos"
        let serverKey = 'online';
        try { serverKey = new URL(e.url).searchParams.get('server') || 'online'; } catch {}
        return {
          name: `${e.lang || 'Latino'} · ${e.quality || 'HD'}`,
          url: e.url,
          server: serverKey,
        };
      });
    // Reordenar: goodstream primero (sin anuncios con auto-play), vimeos último (tiene pre-roll)
    const PRIORITY = ['goodstream', 'hlswish', 'streamwish', 'filemoon', 'doodstream'];
    servers.sort((a, b) => {
      const aKey = a.server?.toLowerCase() || '';
      const bKey = b.server?.toLowerCase() || '';
      // vimeos siempre al final
      if (aKey === 'vimeos') return 1;
      if (bKey === 'vimeos') return -1;
      // Priorizar los que están en PRIORITY
      const aIdx = PRIORITY.findIndex(p => aKey.includes(p));
      const bIdx = PRIORITY.findIndex(p => bKey.includes(p));
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return 0;
    });
    return servers;


  } catch (err) {
    console.warn('[Cuevana] fetchLinks error:', err);
    return [];
  }
}

async function fetchCuevanaEpisodeLinks(seriesId: string, season: number, episode: number): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `https://cuevana.gs/wp-api/v1/single/episodes/list?_id=${seriesId}&season=${season}&page=1&postsPerPage=50`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const posts: any[] = data?.data?.posts || [];
    const ep = posts.find((p: any) =>
      p.episode_number === episode || p.number === episode || p.order === episode
    ) || posts[episode - 1];
    if (!ep?._id) return [];
    const links = await fetchCuevanaLinks(ep._id.toString());
    return links.map((l: any) => l.url);
  } catch (err) {
    console.warn('[Cuevana] fetchEpisodeLinks error:', err);
    return [];
  }
}

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
  const [fetchingLink, setFetchingLink] = useState(false);
  // Servidores cacheados: se llenan al reproducir/abrir modal (on-demand si es Cuevana)
  const [cachedServers, setCachedServers] = useState<{ name: string; url: string }[]>([]);

  const isSeries = item?.type === 'series' || item?.type === 'anime';
  const isLiveTV = item?.type === 'tv';
  const hasSeasons = isSeries && item?.seasonsData && item.seasonsData.length > 0;
  const isCuevana = (item?.source === 'cuevana' || item?.source === 'cuevana-bi') && !!item?.tmdb_id;
  const isCuevanaBi = item?.source === 'cuevana-bi';

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
  const currentSeasonCount = Array.isArray(currentSeasonData?.episodes) 
    ? currentSeasonData.episodes.length 
    : (currentSeasonData?.episodes || 0);

  const episodesArray = Array.from({ length: currentSeasonCount }, (_, i) => i + 1);

  // ─── Funciones de Lógica de Reproducción ──────────────────────────────────
  const getStoredServers = (season: number, ep: number) => {
    if (isSeries) {
      // 1. Intentar obtener desde seasonsData (formato nuevo La.Movie)
      const seasonObj = item.seasonsData?.find((s: any) => s.season === season);
      if (seasonObj && Array.isArray(seasonObj.episodes)) {
         const epObj = seasonObj.episodes.find((e: any) => e.episodeNumber === ep) || seasonObj.episodes[ep - 1];
         if (epObj) {
            if (epObj.servers && epObj.servers.length > 0) return epObj.servers.map((s:any) => ({ name: s.name || s.server || 'SERVIDOR PREMIUM', url: s.url }));
            if (epObj.videoUrl) return [{ name: 'SERVIDOR PRINCIPAL', url: epObj.videoUrl }];
         }
      }

      // 2. Fallback al clásico episodeLinks
      const linksData = item.episodeLinks?.[`${season}-${ep}`];
      if (linksData) {
        return Array.isArray(linksData)
          ? linksData.map((l: any, i: number) => typeof l === 'string' ? { name: `SERVIDOR ${i + 1}`, url: l } : l)
          : [{ name: 'SERVIDOR PREMIUM', url: linksData }];
      }
      return [];
    }
    const s = item.servers?.length > 0 ? item.servers : (item.videoUrl ? [{ name: 'SERVIDOR PRINCIPAL', url: item.videoUrl }] : []);
    return s.map((srv: any, i: number) => typeof srv === 'string' ? { name: `SERVIDOR ${i + 1}`, url: srv } : srv);
  };

  // Resuelve servidores: desde Firebase o fetch on-demand desde Cuevana
  const resolveServers = useCallback(async (season: number, ep: number): Promise<{ name: string; url: string }[]> => {
    // 1. Intentar desde caché local (ya buscado antes)
    if (cachedServers.length > 0) return cachedServers;

    // 2. Intentar desde Firebase (links pre-guardados)
    const stored = getStoredServers(season, ep);
    if (stored.length > 0) {
      setCachedServers(stored);
      return stored;
    }

    // 3. cuevana-bi: construir URL directo (sin API call)
    if (isCuevanaBi && item?.slug) {
      let url: string;
      if (isSeries) {
        url = `https://cuevana.bi/serie/${item.slug}/temporada-${season}/episodio-${ep}`;
      } else {
        url = item.videoUrl || `https://cuevana.bi/pelicula/${item.slug}`;
      }
      const servers = [{ name: 'CUEVANA', url }];
      setCachedServers(servers);
      return servers;
    }

    // 4. cuevana.gs: Fetch on-demand desde API
    if (!isCuevana) return [];
    setFetchingLink(true);
    try {
      let servers: { name: string; url: string }[];
      if (isSeries) {
        const urls = await fetchCuevanaEpisodeLinks(item.tmdb_id, season, ep);
        servers = urls.map((url, i) => ({ name: `Servidor ${i + 1}`, url }));
      } else {
        servers = await fetchCuevanaLinks(item.tmdb_id);
      }
      setCachedServers(servers);
      return servers;
    } finally {
      setFetchingLink(false);
    }
  }, [item, isSeries, isCuevana, isCuevanaBi, cachedServers, selectedSeason, selectedEpisode]);


  // Obtiene links: primero de Firebase; si vacío y es Cuevana, los busca on-demand
  const resolveAndPlay = useCallback(async (season: number, ep: number, forParty = false) => {
    setSelectedEpisode(ep);
    // Reset caché si cambiamos de episodio
    if (ep !== selectedEpisode || season !== selectedSeason) setCachedServers([]);

    const servers = await resolveServers(season, ep);

    if (servers.length === 0) {
      Alert.alert('Sin señal', 'No se encontró link de reproducción para este título.');
      return;
    }

    if (isSeries) {
      markAsWatched(`${item.id}-s${season}-e${ep}`);
      addToHistory(item, season, ep);
    } else {
      addToHistory(item);
    }

    if (forParty) {
      navigation.navigate('PartySetup', { videoUrl: servers[0].url, title: item.title });
      return;
    }

    if (item.genre === 'Deportes') {
      navigation.navigate('SportsPlayerTV', { item });
    } else if (isSeries) {
      navigation.navigate('PlayerTV', {
        videoUrl: servers[0].url,
        title: `${item.title} - T${season} E${ep}`,
        seriesItem: item, season, episode: ep,
      });
    } else {
      navigation.navigate('PlayerTV', { videoUrl: servers[0].url, title: item.title });
    }
  }, [item, isSeries, isCuevana, selectedSeason]);

  const directPlayEpisode = async (season: number, ep: number) => {
    setActionType('play');
    setSelectedEpisode(ep);
    
    const servers = await resolveServers(season, ep);
    if (servers.length === 0) {
      Alert.alert('Sin señal', 'No se encontró link de reproducción para este episodio.');
      return;
    }
    
    // Si hay un solo servidor, reproduce directo. Si hay más de 1, muestra el selector.
    if (servers.length === 1) {
      resolveAndPlay(season, ep, false);
    } else {
      setShowServerModal(true);
    }
  };

  const handleMainPlay = () => {
    if (isSeries) {
      resolveAndPlay(selectedSeason, selectedEpisode, false);
    } else {
      resolveAndPlay(1, 1, false);
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
              {fetchingLink ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 12,
                  paddingHorizontal: 28, paddingVertical: 14, borderRadius: 8, borderWidth: 2,
                  borderColor: '#B026FF', backgroundColor: 'rgba(176,38,255,0.2)' }}>
                  <ActivityIndicator size="small" color="#B026FF" style={{ marginRight: 10 }} />
                  <Text style={{ fontWeight: '900', fontSize: 13, textTransform: 'uppercase',
                    letterSpacing: 1.5, color: '#B026FF' }}>BUSCANDO ENLACE...</Text>
                </View>
              ) : (
                <GlassButton title={isSeries ? "REPRODUCIR EP" : "REPRODUCIR"} isPrimary={true} onPress={handleMainPlay} />
              )}
              <GlassButton title={isSaved ? "EN LISTA" : "MI LISTA"} onPress={() => toggleMyList(item.id)} />
              {!isLiveTV && <GlassButton title="PARTY" onPress={async () => {
                setActionType('party');
                await resolveServers(selectedSeason, selectedEpisode);
                setShowServerModal(true);
              }} />}
              {!isLiveTV && <GlassButton title="SERVIDORES" onPress={async () => {
                setActionType('play');
                await resolveServers(selectedSeason, selectedEpisode);
                setShowServerModal(true);
              }} />}
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
              horizontal showsHorizontalScrollIndicator={false} data={item.seasonsData} keyExtractor={(s: any, idx: number) => `season-${s.season}-${idx}`} 
              nestedScrollEnabled scrollEnabled={false}
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
              horizontal showsHorizontalScrollIndicator={false} data={episodesArray} keyExtractor={(ep, idx) => `ep-${ep}-${idx}`}
              nestedScrollEnabled scrollEnabled={false}
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
              {fetchingLink ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <ActivityIndicator size="large" color="#B026FF" />
                  <Text style={{ color: '#B026FF', fontWeight: '900', fontSize: 14,
                    letterSpacing: 2, marginTop: 16, textTransform: 'uppercase' }}>Buscando servidores...</Text>
                </View>
              ) : (
                (cachedServers.length > 0 ? cachedServers : getStoredServers(selectedSeason, selectedEpisode)).map((srv: any, idx: number) => (
                <TvFocusable key={idx} onPress={() => {
                  setShowServerModal(false);
                  
                  // Grabar historial al reproducir
                  if (actionType === 'play') {
                    if (isSeries) {
                      markAsWatched(`${item.id}-s${selectedSeason}-e${selectedEpisode}`);
                      addToHistory(item, selectedSeason, selectedEpisode);
                    } else {
                      addToHistory(item);
                    }
                  }

                  if (actionType === 'play') {
                    if (item.genre === 'Deportes') {
                      navigation.navigate('SportsPlayerTV', { item: { ...item, videoUrl: srv.url } });
                    } else if (isSeries) {
                      navigation.navigate('PlayerTV', {
                        videoUrl: srv.url,
                        title: `${item.title} - T${selectedSeason} E${selectedEpisode}`,
                        seriesItem: item, season: selectedSeason, episode: selectedEpisode,
                      });
                    } else {
                      navigation.navigate('PlayerTV', { videoUrl: srv.url, title: item.title });
                    }
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
                ))
              )}

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