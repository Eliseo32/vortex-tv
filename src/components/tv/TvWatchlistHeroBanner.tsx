import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { PlayCircle, Clock } from 'lucide-react-native';
import TvFocusable from './TvFocusable';

// Diseño Exótico "Lumina Cinematic" para Seguir Viendo
// Formato panorámico adaptado para carrusel horizontal

export default function TvWatchlistHeroBanner({
  historyData,
  onPress,
}: {
  historyData: any; // Puede ser un HistoryItem {item, season, episode} o un ContentItem directo
  onPress: () => void;
}) {
  if (!historyData) return null;

  // Extraemos si viene envuelto en HistoryItem o es contenido directo
  const isHistoryObj = historyData.item !== undefined;
  const item = isHistoryObj ? historyData.item : historyData;
  const season = isHistoryObj ? historyData.season : undefined;
  const episode = isHistoryObj ? historyData.episode : undefined;

  // Si hay progreso guardado, lo usamos. Para el MVP simulamos un progreso fluido.
  const progress = item.progress || Math.floor(Math.random() * 40) + 30; // 30% a 70%

  return (
    <View style={styles.wrapper}>
      <TvFocusable
        onPress={onPress}
        scaleTo={1.03}
        borderWidth={0}
        style={styles.card}
      >
        {(focused: boolean) => (
          <View style={styles.inner}>
            
            {/* 1. Backdrop Background */}
            <Image
              source={{ uri: item.backdrop || item.poster }}
              style={styles.backdrop}
              contentFit="cover"
              transition={200}
            />
            
            {/* 2. Capa de oscurecimiento cinematográfico (OLED Black) */}
            <View style={[styles.gradientOverlay, { opacity: focused ? 0.2 : 0.6 }]} />

            {/* 3. Acento Neón cuando está enfocado */}
            {focused && <View style={styles.focusBorder} />}

            {/* 4. Contenido (Metadata + Acciones) */}
            <View style={styles.content}>
              
              <View style={styles.badgeRow}>
                <Clock color="#00E5FF" size={14} />
                <Text style={styles.badgeText}>SEGUIR VIENDO</Text>
              </View>
              
              <Text numberOfLines={2} style={[styles.title, focused && styles.titleGlow]}>
                {item.title || item.name || 'Contenido'}
              </Text>
              
              {/* Información de Capítulo o Progreso */}
              {season && episode ? (
                  <View style={{ marginTop: 8 }}>
                      <Text style={styles.seasonText}>Temporada {season} · Episodio {episode}</Text>
                  </View>
              ) : (
                  <View style={styles.progressContainer}>
                    <Text style={styles.progressText}>Quedan {100 - progress} min</Text>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: focused ? '#00E5FF' : 'rgba(255,255,255,0.6)' }]} />
                    </View>
                  </View>
              )}

              {/* Botón Principal Flotante */}
              <View style={[styles.playBtn, focused && styles.playBtnActive]}>
                <PlayCircle color={focused ? "#000" : "#fff"} size={20} fill={focused ? "#000" : "transparent"} />
                <Text style={[styles.playBtnText, focused && { color: '#000' }]}>
                  REANUDAR
                </Text>
              </View>
            </View>

          </View>
        )}
      </TvFocusable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginRight: 40,
    width: 850, // Ancho fijo para que el carrusel horizontal funcione nativamente
  },
  card: {
    width: '100%',
    height: 380, // Aspect ratio panorámico cinemático
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  inner: {
    flex: 1,
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000', // Capa de tinte general que se levanta al focus
  },
  focusBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 4,
    borderColor: '#00E5FF',
    borderRadius: 24,
    zIndex: 10,
  },
  content: {
    position: 'absolute',
    bottom: 40,
    left: 48,
    width: '85%',
    gap: 12,
    zIndex: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  badgeText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 48,
  },
  titleGlow: {
    textShadowColor: 'rgba(0, 229, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  seasonText: {
    color: '#00E5FF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressContainer: {
    marginTop: 8,
    width: 250,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  playBtnActive: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  playBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
