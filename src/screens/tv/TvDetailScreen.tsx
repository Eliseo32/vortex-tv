import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Image, Dimensions, Modal, FlatList, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Play, Plus, Check, ChevronLeft, Users, Server, Tv2, Star, Sparkles } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import TvFocusable from '../../components/tv/TvFocusable';
import TvMovieCard from '../../components/tv/TvMovieCard';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

const CinematicButton = ({ icon: Icon, title, onPress, bg = 'rgba(255,255,255,0.08)', activeBg = '#fff', isPrimary = false }: any) => (
  <TvFocusable onPress={onPress} borderWidth={0} scaleTo={1.06} style={{ borderRadius: 14, marginRight: 16 }}>
    {(focused: boolean) => (
      <View style={{ 
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 18, borderRadius: 14, 
        backgroundColor: isPrimary ? (focused ? '#fff' : '#FACC15') : (focused ? '#fff' : bg),
        borderWidth: isPrimary ? 0 : 1, borderColor: focused ? 'transparent' : 'rgba(255,255,255,0.1)'
      }}>
        <Icon color={isPrimary ? "#000" : (focused ? "#000" : "#fff")} size={22} fill={isPrimary ? "#000" : "none"} />
        {title && <Text style={{ fontWeight: 'black', fontSize: 17, marginLeft: 14, textTransform: 'uppercase', letterSpacing: 1.5, color: isPrimary ? '#000' : (focused ? '#000' : '#fff') }}>{title}</Text>}
      </View>
    )}
  </TvFocusable>
);

export default function TvDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const item = route.params?.item;
  const { toggleMyList, isInMyList, markAsWatched, isWatched, addToHistory, cloudContent } = useAppStore();

  const [showServerModal, setShowServerModal] = useState(false);
  const [actionType, setActionType] = useState<'play' | 'party' | null>(null);

  const isSeries = item?.type === 'series' || item?.type === 'anime';
  const isLiveTV = item?.type === 'tv';
  const hasSeasons = isSeries && item?.seasonsData && item.seasonsData.length > 0;
  
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  const similarItems = useMemo(() => cloudContent.filter(c => c.type === item?.type && c.id !== item?.id).slice(0, 10), [cloudContent, item]);

  useEffect(() => {
    if (route.params?.season && route.params?.episode) {
      setSelectedSeason(route.params.season);
      setSelectedEpisode(route.params.episode);
    } else if (hasSeasons) {
      setSelectedSeason(item.seasonsData[0].season);
    }
  }, [item, route.params]);

  if (!item) return <View className="flex-1 bg-[#050505]" />;
  const isSaved = isInMyList(item.id);
  const currentSeasonData = item.seasonsData?.find((s: any) => s.season === selectedSeason);
  const episodesArray = Array.from({ length: currentSeasonData?.episodes || 0 }, (_, i) => i + 1);

  const getDynamicServers = () => {
    if (isSeries && item.tmdb_id) {
      const linksData = item.episodeLinks && item.episodeLinks[`${selectedSeason}-${selectedEpisode}`];
      if (linksData) return Array.isArray(linksData) ? linksData.map((l, i) => typeof l === 'string' ? { name: `Servidor ${i + 1}`, url: l } : l) : [{ name: '🌟 Servidor Premium', url: linksData }];
      return [];
    }
    const movieServers = item.servers && item.servers.length > 0 ? item.servers : (item.videoUrl ? [{ name: 'Servidor Principal', url: item.videoUrl }] : []);
    return movieServers.map((srv: any, i: number) => typeof srv === 'string' ? { name: `Servidor ${i + 1}`, url: srv } : srv);
  };

  const handlePlayDirect = () => {
    const servers = getDynamicServers();
    if (servers.length === 0) return; 
    if (isSeries) { markAsWatched(`${item.id}-s${selectedSeason}-e${selectedEpisode}`); addToHistory(item, selectedSeason, selectedEpisode); } 
    else { addToHistory(item); }
    navigation.navigate('PlayerTV', { videoUrl: servers[0].url, title: isSeries ? `${item.title} - T${selectedSeason} E${selectedEpisode}` : item.title });
  };

  return (
    <View className="flex-1 bg-[#050505]">
      
      {/* 🌌 FONDO MÁGICO (Ambilight Cinematic Aura) */}
      <View style={StyleSheet.absoluteFillObject} className="bg-[#050505]">
        
        {/* Capa 1: Aura desenfocada (Extrae el color dominante de la película) */}
        <Image 
          source={{ uri: item.backdrop || item.poster }} 
          style={[StyleSheet.absoluteFillObject, { opacity: 0.45 }]} 
          blurRadius={90} // Desenfoque extremo para crear iluminación ambiental
        />
        
        {/* Capa 2: Imagen Nítida empujada hacia la DERECHA */}
        <View style={{ position: 'absolute', top: 0, right: 0, width: '70%', height: windowHeight * 0.9 }}>
          {/* Unimos la imagen con un gradiente para que no se vea el corte */}
          <Image source={{ uri: item.backdrop || item.poster }} style={{ width: '100%', height: '100%', opacity: 0.85 }} resizeMode="cover" />
          <View className="absolute inset-0 bg-gradient-to-l from-transparent via-[#050505]/40 to-[#050505]" />
        </View>

        {/* Capa 3: Gradiente de Legibilidad Estricto (Protege el texto a la IZQUIERDA) */}
        <View className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/95 to-transparent w-[65%]" />
        <View className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/30 to-transparent" />
      </View>

      <ScrollView className="flex-1 z-10" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* BOTÓN VOLVER FLOTANTE */}
        <View className="px-16 pt-12 pb-2">
          <TvFocusable onPress={() => navigation.goBack()} borderWidth={0} style={{ borderRadius: 999, alignSelf: 'flex-start' }} focusedStyle={{ backgroundColor: '#fff' }}>
            {(focused: boolean) => (
              <View className={`w-14 h-14 rounded-full items-center justify-center border border-white/10 shadow-lg shadow-black ${focused ? 'bg-white' : 'bg-[#050505]/40'}`}>
                <ChevronLeft color={focused ? "#000" : "#fff"} size={32} />
              </View>
            )}
          </TvFocusable>
        </View>

        {/* 📋 SECCIÓN HERO: METADATA Y BOTONES */}
        <View className="px-16 pt-2 min-h-[50vh] justify-center">
          <View className="flex-row items-center mb-5 space-x-3">
             <View className="bg-white/10 px-3 py-1.5 rounded-md border border-white/20">
               <Text className="text-white text-[11px] font-black tracking-widest uppercase">{isLiveTV ? 'TV en Vivo' : isSeries ? 'Serie Original' : 'Película Destacada'}</Text>
             </View>
          </View>

          <Text numberOfLines={2} className="text-white text-7xl font-black leading-tight mb-8 shadow-black drop-shadow-2xl tracking-tighter max-w-[65%]">
            {item.title}
          </Text>

          <View className="flex-row items-center mb-8 space-x-4">
            <View className="flex-row items-center bg-green-500/20 px-3 py-1.5 rounded border border-green-500/50">
              <Star color="#4ade80" size={16} fill="#4ade80" />
              <Text className="text-green-400 font-black text-base ml-2">{item.rating || '9.8'}</Text>
            </View>
            <Text className="text-gray-200 font-bold text-xl">{item.year}</Text>
            <View className="border border-white/20 px-2 py-1 rounded bg-black/40"><Text className="text-white text-xs font-bold tracking-widest">4K HDR</Text></View>
            <Text className="text-gray-200 font-bold text-xl">{item.genre}</Text>
          </View>

          <Text numberOfLines={3} className="text-gray-300 text-xl leading-9 font-medium mb-12 max-w-[60%] drop-shadow-xl shadow-black">
            {item.description}
          </Text>

          {/* BOTONES DE ACCIÓN */}
          <View className="flex-row items-center">
            <CinematicButton icon={Play} title={isSeries ? `Reproducir T${selectedSeason} E${selectedEpisode}` : isLiveTV ? 'Sintonizar' : 'Reproducir Ahora'} isPrimary={true} onPress={handlePlayDirect} />
            <CinematicButton icon={isSaved ? Check : Plus} title="Mi Lista" onPress={() => toggleMyList(item.id)} />
            <CinematicButton icon={Server} onPress={() => { setActionType('play'); setShowServerModal(true); }} />
            {!isLiveTV && <CinematicButton icon={Users} bg="rgba(147,51,234,0.2)" onPress={() => { setActionType('party'); setShowServerModal(true); }} />}
          </View>
        </View>

        {/* 🎬 CONTENIDO ENRQUECIDO */}
        <View className="px-16 mt-12 pt-12 border-t border-white/10">
          
          {hasSeasons && (
            <View className="mb-16">
              <Text className="text-white font-black text-3xl mb-8 tracking-wide drop-shadow-md">Temporadas</Text>
              <FlatList
                horizontal showsHorizontalScrollIndicator={false} data={item.seasonsData} keyExtractor={(s: any) => s.season.toString()} className="mb-10"
                renderItem={({ item: s }: any) => (
                  <TvFocusable onPress={() => { setSelectedSeason(s.season); setSelectedEpisode(1); }} borderWidth={0} style={{ borderRadius: 12, marginRight: 16 }}>
                    {(focused: boolean) => (
                      <View className={`px-8 py-4 rounded-xl border ${selectedSeason === s.season && !focused ? 'bg-white/10 border-white/30' : focused ? 'bg-white border-white' : 'bg-[#111] border-white/10'}`}>
                        <Text style={{ fontWeight: 'black', fontSize: 16, textTransform: 'uppercase', color: focused ? '#000' : (selectedSeason === s.season ? '#fff' : '#9CA3AF') }}>
                          Temporada {s.season}
                        </Text>
                      </View>
                    )}
                  </TvFocusable>
                )}
              />

              <Text className="text-white font-black text-3xl mb-8 tracking-wide drop-shadow-md">Episodios</Text>
              <FlatList
                horizontal showsHorizontalScrollIndicator={false} data={episodesArray} keyExtractor={(ep) => ep.toString()}
                renderItem={({ item: epNum }) => {
                  const isEpWatched = isWatched(`${item.id}-s${selectedSeason}-e${epNum}`);
                  return (
                    <TvFocusable onPress={() => setSelectedEpisode(epNum)} borderWidth={4} style={{ borderRadius: 16, marginRight: 24 }}>
                      {(focused: boolean) => (
                        <View className={`w-64 h-36 rounded-xl overflow-hidden justify-end p-5 bg-[#111] ${selectedEpisode === epNum && !focused ? 'border-2 border-white/50' : 'border border-transparent'}`}>
                          {/* Aura ambiental también para los episodios */}
                          <Image source={{ uri: item.backdrop }} className="absolute inset-0 w-full h-full opacity-30" blurRadius={10} />
                          <View className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                          <View className="absolute top-1/2 left-1/2 -mt-5 -ml-5"><Play color={focused ? "#FACC15" : "#fff"} size={40} fill={focused ? "#FACC15" : "none"} opacity={focused ? 1 : 0.7} /></View>
                          <Text style={{ fontWeight: '900', fontSize: 22, color: focused ? '#FACC15' : '#fff', zIndex: 10 }}>Episodio {epNum}</Text>
                          {isEpWatched && <View className="absolute top-3 right-3 bg-green-500 rounded-full p-1.5"><Check color="#fff" size={16} strokeWidth={4} /></View>}
                        </View>
                      )}
                    </TvFocusable>
                  );
                }}
              />
            </View>
          )}

          {similarItems.length > 0 && (
            <View className="mb-8">
              <Text className="text-white text-3xl font-black mb-8 tracking-wide">Más como esto</Text>
              <FlatList
                horizontal showsHorizontalScrollIndicator={false} data={similarItems} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => <TvMovieCard item={item} onPress={() => navigation.replace('DetailTV', { item })} />}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* MODAL DE SERVIDORES */}
      <Modal visible={showServerModal} transparent animationType="fade">
        <View className="flex-1 bg-black/90 justify-center items-center">
          <View className="w-[600px] bg-[#0a0a0a] rounded-3xl p-10 border border-white/10 shadow-2xl shadow-black">
            <Text className="text-white text-3xl font-black text-center mb-8">Seleccionar Servidor</Text>
            {getDynamicServers().map((srv: any, idx: number) => (
              <TvFocusable key={idx} onPress={() => { setShowServerModal(false); if (actionType === 'play') navigation.navigate('PlayerTV', { videoUrl: srv.url, title: item.title }); else navigation.navigate('PartySetup', { item, title: item.title, backdrop: item.backdrop, selectedVideoUrl: srv.url }); }} borderWidth={3} style={{ borderRadius: 16, marginBottom: 16 }}>
                {(focused: boolean) => (
                  <View className="px-8 py-5 rounded-xl bg-white/5 flex-row justify-between items-center border border-white/5">
                    <Text className="text-white font-bold text-xl">{srv.name}</Text>
                    <Play color={focused ? "#000" : "#6B7280"} size={24} fill={focused ? "#000" : "none"} />
                  </View>
                )}
              </TvFocusable>
            ))}
            <TvFocusable onPress={() => setShowServerModal(false)} borderWidth={3} style={{ borderRadius: 16, marginTop: 16 }}>
              {(focused: boolean) => (
                <View className="px-8 py-5 rounded-xl bg-red-600/20 items-center border border-red-500/20">
                  <Text style={{ fontWeight: 'black', fontSize: 18, color: focused ? '#000' : '#ef4444', textTransform: 'uppercase' }}>Cancelar</Text>
                </View>
              )}
            </TvFocusable>
          </View>
        </View>
      </Modal>
    </View>
  );
}