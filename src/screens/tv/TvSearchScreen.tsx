import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList } from 'react-native';
import { Search } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import TvMovieCard from '../../components/tv/TvMovieCard';
import { useNavigation } from '@react-navigation/native';

export default function TvSearchScreen() {
  const [query, setQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const { cloudContent } = useAppStore();
  const navigation = useNavigation<any>();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return cloudContent.filter(item => 
      item.title.toLowerCase().includes(q) || 
      (item.genre && item.genre.toLowerCase().includes(q))
    );
  }, [query, cloudContent]);

  return (
    <View className="flex-1 bg-[#050505] pt-32 px-16">
      
      {/* CONTENEDOR DE BÚSQUEDA CORREGIDO (Sin la propiedad transition inválida) */}
      <View 
        style={[
          { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, paddingHorizontal: 24, marginBottom: 32, borderWidth: 4, borderColor: 'transparent' },
          inputFocused && { borderColor: '#FACC15', backgroundColor: 'rgba(255,255,255,0.1)', transform: [{ scale: 1.02 }], shadowColor: '#FACC15', elevation: 10, shadowOpacity: 0.2, shadowRadius: 10 }
        ]}
      >
        <Search color={inputFocused ? "#FACC15" : "#9CA3AF"} size={32} />
        <TextInput
          focusable={true}
          placeholder="Busca por título o género (ej: Acción, Comedia)"
          placeholderTextColor="#6B7280"
          value={query}
          onChangeText={setQuery}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          style={{ flex: 1, color: '#fff', fontSize: 24, fontWeight: 'bold', marginLeft: 20, paddingVertical: 24 }}
        />
      </View>
      
      {query.trim() === '' ? (
        <View className="flex-1 items-center justify-center pb-32">
          <Search color="#222" size={100} className="mb-6" />
          <Text className="text-gray-500 text-3xl font-bold">¿Qué quieres ver hoy?</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={6} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 10 }}
          ListEmptyComponent={
            <Text className="text-gray-400 text-2xl text-center mt-10">No encontramos resultados para "{query}"</Text>
          }
          renderItem={({ item }) => (
             <TvMovieCard item={item} onPress={() => navigation.navigate('DetailTV', { item })} />
          )}
        />
      )}
    </View>
  );
}