import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, FlatList, StyleSheet, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import F1HeroBanner from '../../components/tv/F1HeroBanner';
import TvFocusable from '../../components/tv/TvFocusable';
import TvMovieCard from '../../components/tv/TvMovieCard';

// ─── Categorías ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'movies', label: 'Películas', screen: 'movie', accent: '#BF40BF', image: 'https://imgs.search.brave.com/jH5DpJrwZR2rDJ_w18PqO-NhLZK9eQmkSzT2L5T5dfo/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pbWFn/ZW5lcy5ob2JieWNv/bnNvbGFzLmNvbS9m/aWxlcy9pbWFnZV82/NDBfYXV0by91cGxv/YWRzL2ltYWdlbmVz/LzIwMjMvMDUvMDUv/NjkwMzhlYWEyNjM5/YS5qcGVn' },
  { id: 'series', label: 'Series', screen: 'series', accent: '#FF6EC7', image: 'https://imgs.search.brave.com/PfB1d9kfdp4W8FHa22vKfl6AJ3dL5F6S3heQb_kCpV8/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9lcy53/ZWIuaW1nMy5hY3N0/YS5uZXQvY180MDBf/MjI1L2ltZy85My9k/Yi85M2RiMjIxMGM1/YWQ3ZTQ3ZTlmY2M1/NmIzMDNiZjUyMy5q/cGc' },
  { id: 'anime', label: 'Anime', screen: 'anime', accent: '#FFD700', image: 'https://imgs.search.brave.com/5HLakxtPi5vchpQxC0jD1iQyazxFBHAyjLak3kMs6fg/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly93YWxs/cGFwZXJjYXZlLmNv/bS93cC93cDk1MDM0/OTMuanBn' },
  { id: 'sports', label: 'Deportes', screen: 'sport', accent: '#39FF14', image: 'data:image/jpeg;base64,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' },
  { id: 'channels', label: 'TV en Vivo', screen: 'tv', accent: '#3b82f6', image: 'https://images.unsplash.com/photo-1606814893907-59818b4dd428?q=80&w=600&auto=format&fit=crop' },
];

// ─── Category Button ──────────────────────────────────────────────────────────
const CategoryBtn = React.memo(function CategoryBtn({
  item,
  onPress,
}: {
  item: typeof CATEGORIES[0];
  onPress: () => void;
}) {
  return (
    <View style={{ marginRight: 24, marginVertical: 8 }}>
      <TvFocusable
        onPress={onPress}
        scaleTo={1.08}
        borderWidth={0}
        style={{ borderRadius: 16, width: 220, height: 130 }}
      >
        {(focused: boolean) => (
          <View style={[styles.categoryBtn, { borderColor: focused ? item.accent : 'rgba(255,255,255,0.1)' }]}>
            <Image source={{ uri: item.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: focused ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.58)' }]} />
            {focused && (
              <View style={[StyleSheet.absoluteFillObject, {
                borderRadius: 16, borderWidth: 3, borderColor: item.accent,
              }]} />
            )}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
              <Text style={[styles.categoryBtnText, { color: focused ? '#fff' : '#E5E7EB' }]}>
                {item.label}
              </Text>
            </View>
          </View>
        )}
      </TvFocusable>
    </View>
  );
});

// ─── Content Row ──────────────────────────────────────────────────────────────
function ContentRow({ title, data, accent, onPress }: {
  title: string;
  data: any[];
  accent: string;
  onPress: (item: any) => void;
}) {
  if (!data || data.length === 0) return null;
  return (
    <View style={{ marginBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingLeft: 40 }}>
        <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: accent, marginRight: 14 }} />
        <Text style={{ color: '#f0f0fd', fontSize: 18, fontWeight: '900', letterSpacing: 1.5 }}>{title}</Text>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 40, paddingBottom: 10 }}
        initialNumToRender={5}
        maxToRenderPerBatch={3}
        windowSize={5}
        renderItem={({ item }) => (
          <TvMovieCard
            item={item}
            onPress={() => onPress(item)}
            accentColor={accent}
            width={160}
            height={240}
          />
        )}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TvDiscoverScreen({ currentTab }: { currentTab: string }) {
  const navigation = useNavigation<any>();
  const { cloudContent } = useAppStore();

  const trendingMovies = useMemo(
    () => cloudContent.filter((i) => i.type === 'movie').slice(0, 15),
    [cloudContent],
  );
  const trendingSeries = useMemo(
    () => cloudContent.filter((i) => i.type === 'series').slice(0, 15),
    [cloudContent],
  );
  const upcomingSports = useMemo(
    () => cloudContent.filter((i) => i.type === 'tv' && i.genre === 'Deportes').slice(0, 15),
    [cloudContent],
  );

  const handleCategoryPress = (item: typeof CATEGORIES[0]) => {
    if (item.screen === 'sport') {
      navigation.navigate('SportsTV');
    } else {
      navigation.navigate('LiveCategoryTV', { category: item.screen });
    }
  };

  const handleContentPress = (item: any) => {
    navigation.navigate('DetailTV', { item });
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: 100, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. F1 HERO BANNER */}
      <View style={{ marginBottom: 40, marginHorizontal: 0 }}>
        <F1HeroBanner onPress={() => navigation.navigate('F1TelemetryTV')} />
      </View>

      {/* 2. CATEGORÍAS */}
      <View style={{ marginBottom: 48 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingLeft: 40 }}>
          <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: '#b6a0ff', marginRight: 14 }} />
          <Text style={{ color: '#f0f0fd', fontSize: 18, fontWeight: '900', letterSpacing: 1.5 }}>
            EXPLORAR CATEGORÍAS
          </Text>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: 40, paddingBottom: 8 }}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <CategoryBtn item={item} onPress={() => handleCategoryPress(item)} />
          )}
        />
      </View>

      {/* 3. FILAS DE CONTENIDO */}
      <ContentRow title="PELÍCULAS DESTACADAS" data={trendingMovies} accent="#BF40BF" onPress={handleContentPress} />
      <ContentRow title="SERIES TOP" data={trendingSeries} accent="#FF6EC7" onPress={handleContentPress} />
      <ContentRow title="DEPORTES EN VIVO" data={upcomingSports} accent="#39FF14" onPress={handleContentPress} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  categoryBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
  },
  categoryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
