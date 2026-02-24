import React from 'react';
import { View, Image, Text } from 'react-native';
import TvFocusable from './TvFocusable';

interface TvMovieCardProps {
  item: any;
  onPress: () => void;
  onFocusItem?: (item: any) => void;
  accentColor?: string;
  width?: number;
  height?: number;
}

export default function TvMovieCard({
  item,
  onPress,
  onFocusItem,
  accentColor = '#FACC15',
  width = 120,
  height = 180,
}: TvMovieCardProps) {
  return (
    <View style={{ marginHorizontal: 8, marginVertical: 12 }}>
      <TvFocusable
        onPress={onPress}
        onFocus={() => { if (onFocusItem) onFocusItem(item); }}
        scaleTo={1.12}
        style={{ width, height, overflow: 'hidden', backgroundColor: '#111', borderRadius: 10 }}
      >
        {(focused) => (
          <>
            <Image
              source={{ uri: item.poster }}
              style={{ width: '100%', height: '100%', position: 'absolute' }}
              resizeMode="cover"
            />

            {/* Oscurecimiento cuando no está enfocado */}
            {!focused && <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.28)' }} />}

            {/* Borde de acento al enfocar */}
            {focused && (
              <View style={{
                position: 'absolute', inset: 0, borderRadius: 10,
                borderWidth: 2, borderColor: accentColor,
              }} />
            )}

            {/* Badge EN VIVO para canales TV */}
            {item.type === 'tv' && (
              <View style={{
                position: 'absolute', top: 8, right: 8,
                backgroundColor: 'rgba(220,38,38,0.9)',
                paddingHorizontal: 6, paddingVertical: 3,
                borderRadius: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.5)',
              }}>
                <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  EN VIVO
                </Text>
              </View>
            )}

            {/* Rating en la esquina inferior si existe */}
            {item.rating && focused && (
              <View style={{
                position: 'absolute', bottom: 8, left: 8,
                backgroundColor: 'rgba(0,0,0,0.75)',
                paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
              }}>
                <Text style={{ color: '#FACC15', fontSize: 9, fontWeight: '800' }}>
                  ⭐ {item.rating}
                </Text>
              </View>
            )}
          </>
        )}
      </TvFocusable>
    </View>
  );
}