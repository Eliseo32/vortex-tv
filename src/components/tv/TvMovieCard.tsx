import React, { useCallback } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
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
  accentColor = '#B026FF',
  width = 120,
  height = 180,
}: TvMovieCardProps) {
  const handleFocus = useCallback(() => {
    if (onFocusItem) onFocusItem(item);
  }, [item, onFocusItem]);

  return (
    <View style={styles.container}>
      <TvFocusable
        onPress={onPress}
        onFocus={handleFocus}
        scaleTo={1.12}
        style={[styles.card, { width, height }]}
      >
        {(focused: boolean) => (
          <>
            <Image
              source={{ uri: item.poster, cache: 'force-cache' }}
              style={styles.poster}
              resizeMode="cover"
            />

            {!focused && <View style={styles.dimOverlay} />}

            {focused && (
              <View style={[styles.focusBorder, { borderColor: accentColor }]} />
            )}

            {item.type === 'tv' && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>EN VIVO</Text>
              </View>
            )}

            {item.rating && focused && (
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingText}>⭐ {item.rating}</Text>
              </View>
            )}
          </>
        )}
      </TvFocusable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 8, marginVertical: 12 },
  card: { overflow: 'hidden', backgroundColor: '#111', borderRadius: 10 },
  poster: { width: '100%', height: '100%', position: 'absolute' },
  dimOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  focusBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, borderWidth: 2 },
  liveBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(220,38,38,0.9)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.5)',
  },
  liveBadgeText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  ratingBadge: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  ratingText: { color: '#B026FF', fontSize: 9, fontWeight: '800' },
});

// Memoize: only re-render if item.id or accentColor changes
export default React.memo(TvMovieCard, (prev, next) => {
  return prev.item.id === next.item.id && prev.accentColor === next.accentColor && prev.width === next.width;
});