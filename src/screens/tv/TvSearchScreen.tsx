import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, TextInput, FlatList, useWindowDimensions } from 'react-native';
import { Search } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import TvMovieCard from '../../components/tv/TvMovieCard';
import TvFocusable from '../../components/tv/TvFocusable';
import { useNavigation } from '@react-navigation/native';

export default function TvSearchScreen() {
  const [query, setQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { cloudContent } = useAppStore();
  const navigation = useNavigation<any>();

  const { width: screenWidth } = useWindowDimensions();
  const safeWidth = Math.max(screenWidth, 1000);
  const numColumns = 5;
  const CARD_WIDTH = (safeWidth - 104 - (16 * numColumns)) / numColumns;
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!query.trim() || query.length < 2) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      
      const q = query.trim();
      const qLower = q.toLowerCase();
      
      // Búsqueda en caché local (instantánea)
      const localMatches = cloudContent.filter(item =>
        item.title.toLowerCase().includes(qLower) ||
        (item.genre && item.genre.toLowerCase().includes(qLower))
      );

      try {
        const { getFirestore, collection, query: fwQuery, where, getDocs, limit } = require('firebase/firestore');
        const db = getFirestore();
        
        // Generar múltiples variantes de casing para cubrir cómo esté guardado en Firebase
        const variants = new Set<string>();
        // Original tal como lo escribió el usuario
        variants.add(q);
        // Title Case: "Avatar"
        variants.add(q.charAt(0).toUpperCase() + q.slice(1).toLowerCase());
        // Todo minúsculas: "avatar"
        variants.add(qLower);
        // Todo mayúsculas: "AVATAR"
        variants.add(q.toUpperCase());
        
        // Lanzar queries en paralelo para todas las variantes
        const queries = Array.from(variants).map(variant =>
          getDocs(fwQuery(
            collection(db, 'content'),
            where('title', '>=', variant),
            where('title', '<=', variant + '\uf8ff'),
            limit(50)
          ))
        );
        
        const snapshots = await Promise.all(queries);
        
        const remoteMatches: any[] = [];
        snapshots.forEach((snap: any) => {
          snap.forEach((doc: any) => remoteMatches.push({ id: doc.id, ...doc.data() }));
        });

        // Unir remotos con locales y quitar duplicados por ID
        const allMatches = [...localMatches, ...remoteMatches];
        const unique = Array.from(new Map(allMatches.map(item => [item.id, item])).values());
        
        setResults(unique);
      } catch (err) {
        console.warn('Error en búsqueda remota:', err);
        setResults(localMatches);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(fetchSearchResults, 400);
    return () => clearTimeout(debounce);
  }, [query, cloudContent]);

  return (
    <View className="flex-1 bg-[#050505] pt-32">

      <View style={{ paddingHorizontal: 52 }}>
        <TvFocusable
          onPress={() => {
            // Un pequeño timeout asegura que el sistema AndroidTV propague
            // correctamente el foco hacia el engine del teclado nativo
            setTimeout(() => inputRef.current?.focus(), 150);
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          borderWidth={0}
          style={{ marginBottom: 32 }}
        >
          {(focused) => (
            <View
              style={[
                { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, paddingHorizontal: 24, borderWidth: 4, borderColor: 'transparent' },
                focused && { borderColor: '#B026FF', backgroundColor: 'rgba(255,255,255,0.1)', transform: [{ scale: 1.02 }] }
              ]}
            >
              <Search color={focused ? "#B026FF" : "#9CA3AF"} size={32} />
              <TextInput
                ref={inputRef}
                focusable={false} // El foco lo maneja TvFocusable en Android TV
                placeholder="Busca por título o género (ej: Acción, Comedia)"
                placeholderTextColor="#6B7280"
                value={query}
                onChangeText={setQuery}
                style={{ flex: 1, color: '#fff', fontSize: 24, fontWeight: 'bold', marginLeft: 20, paddingVertical: 24 }}
              />
            </View>
          )}
        </TvFocusable>
      </View>

      {query.trim() === '' ? (
        <View className="flex-1 items-center justify-center pb-32">
          <Search color="#222" size={100} className="mb-6" />
          <Text className="text-gray-500 text-3xl font-bold">¿Qué quieres ver hoy?</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          numColumns={numColumns}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 52 }}
          columnWrapperStyle={{ marginBottom: 32 }}
          ListEmptyComponent={
            <Text className="text-gray-400 text-2xl text-center mt-10">No encontramos resultados para "{query}"</Text>
          }
          renderItem={({ item }) => (
            <TvMovieCard 
              item={item} 
              width={Math.floor(CARD_WIDTH)} 
              height={Math.floor(CARD_WIDTH * 1.45)} 
              onPress={() => navigation.navigate('DetailTV', { item })} 
            />
          )}
        />
      )}
    </View>
  );
}