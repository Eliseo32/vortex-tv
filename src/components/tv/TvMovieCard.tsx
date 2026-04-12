/**
 * TvMovieCard — Card cinemática premium, estilo Aura Cinematic / Stitch mockup.
 * Estructura: View contenedor con dimensiones fijas → imagen absolute →
 * gradiente inferior → metadata (tipo, título, año, rating, género).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import TvFocusable from './TvFocusable';

interface TvMovieCardProps {
  item: any;
  onPress: () => void;
  onFocusItem?: (item: any) => void;
  accentColor?: string;
  width?: number;
  height?: number;
}

function TvMovieCard({
  item,
  onPress,
  onFocusItem,
  accentColor = '#b6a0ff',
  width = 180,
  height = 260,
}: TvMovieCardProps) {
  const handleFocus = useCallback(() => {
    if (onFocusItem) onFocusItem(item);
  }, [item, onFocusItem]);
  const [imgErr, setImgErr] = useState(false);

  const typeLabel =
    item.type === 'movie'  ? 'FILM'   :
    item.type === 'series' ? 'SERIES' :
    item.type === 'anime'  ? 'ANIME'  :
    item.type === 'tv'     ? 'LIVE'   : '';

  // Colores de placeholder basados en el título (siempre diferentes)
  const charCode = (item.title || '').charCodeAt(0) || 65;
  const hue = (charCode * 37) % 360;
  const placeholderColor = `hsl(${hue}, 45%, 22%)`;

  return (
    <TvFocusable
      onPress={onPress}
      onFocus={handleFocus}
      scaleTo={1.08}
      style={{ marginHorizontal: 8, marginVertical: 8, borderRadius: 14 }}
      borderWidth={0}
    >
      {(focused: boolean) => (
        // ← View con dimensiones explícitas — IMPRESCINDIBLE para que
        //   la Image en position:absolute y el gradiente se vean
        <View style={[styles.card, { width, height, backgroundColor: placeholderColor }]}>
          {/* Poster como background — con fallback si la URL falla */}
          {!!item.poster && !imgErr && (
            <Image
              source={{ uri: item.poster }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={200}
              onError={() => setImgErr(true)}
            />
          )}

          {/* Gradiente inferior para legibilidad */}
          <LinearGradient
            colors={['transparent', 'rgba(12,14,23,0.55)', 'rgba(12,14,23,0.97)']}
            start={{ x: 0, y: 0.35 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Borde coloreado al hacer foco */}
          {focused && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                { borderRadius: 14, borderWidth: 2.5, borderColor: accentColor },
              ]}
            />
          )}

          {/* Badge de tipo — top-left */}
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: focused ? accentColor : 'rgba(12,14,23,0.75)' },
            ]}
          >
            <Text style={[styles.typeBadgeText, { color: focused ? '#000' : '#aaaab7' }]}>
              {typeLabel}
            </Text>
          </View>

          {/* Metadata — bottom */}
          <View style={styles.meta}>
            <Text numberOfLines={2} style={[styles.title, focused && { color: '#fff' }]}>
              {item.title}
            </Text>

            <View style={styles.metaRow}>
              {item.year ? (
                <Text style={styles.metaText}>{item.year}</Text>
              ) : null}
              {item.rating ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={[styles.metaText, { color: accentColor }]}>
                    {item.rating}
                  </Text>
                </>
              ) : null}
            </View>

            {item.genre ? (
              <Text numberOfLines={1} style={styles.genre}>
                {String(item.genre).split(',')[0].trim()}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </TvFocusable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0c0e17',
  },
  typeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  meta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  title: {
    color: '#f0f0fd',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 4,
    lineHeight: 14,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  metaText: { color: '#aaaab7', fontSize: 9, fontWeight: '700' },
  metaDot: { color: '#aaaab7', fontSize: 9 },
  genre: { color: '#737580', fontSize: 8, fontWeight: '600', letterSpacing: 0.5 },
});

export default React.memo(TvMovieCard, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.accentColor === next.accentColor &&
  prev.width === next.width,
);