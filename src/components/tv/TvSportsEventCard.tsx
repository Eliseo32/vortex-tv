import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import TvFocusable from './TvFocusable';

interface TvSportsEventCardProps {
  event: any;
  onPress: () => void;
  onFocusItem?: (item: any) => void;
}

const ACCENT = '#39FF14'; // Verde Neón
const ACCENT_DIM = 'rgba(57, 255, 20, 0.15)';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_DIM = '#9CA3AF'; // grises claros

export default function TvSportsEventCard({ event, onPress, onFocusItem }: TvSportsEventCardProps) {
  const hasVideo = !!event.videoUrl;
  const servers = Array.isArray(event.servers) ? event.servers : [];
  const isLive = (event.status || '').toLowerCase().includes('vivo');

  return (
    <TvFocusable
      onPress={onPress}
      onFocus={() => onFocusItem && onFocusItem(event)}
      borderWidth={0}
      scaleTo={1.05}
      style={{ borderRadius: 16, marginRight: 16 }}
      focusedStyle={{}}
    >
      {(focused: boolean) => (
        <View style={[
          styles.card,
          focused && { borderColor: ACCENT, borderWidth: 2, backgroundColor: 'rgba(6,14,34,0.98)' },
        ]}>
          {/* Franja de color superior */}
          <View style={[styles.topBar, { backgroundColor: isLive ? '#ef4444' : (focused ? ACCENT : 'rgba(57,255,20,0.3)') }]} />

          {/* Cabecera: liga + hora/live */}
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text numberOfLines={1} style={[styles.league, focused && { color: ACCENT }]}>
                {event.league || event.category || 'DEPORTE'}
              </Text>
            </View>
            {isLive ? (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>EN VIVO</Text>
              </View>
            ) : (
              <View style={[styles.timePill, focused && { backgroundColor: ACCENT }]}>
                <Text style={[styles.timeText, focused && { color: '#000' }]}>
                  {event.time || '--:--'}
                </Text>
              </View>
            )}
          </View>

          {/* Divisor */}
          <View style={styles.divider} />

          {/* Equipos */}
          <View style={styles.teamsContainer}>
            {/* Team 1 */}
            <View style={styles.teamRow}>
              {event.logo1 ? (
                <Image source={{ uri: event.logo1 }} style={styles.teamLogo} resizeMode="contain" />
              ) : (
                <View style={[styles.teamLogoFallback, { backgroundColor: ACCENT_DIM }]}>
                  <Text style={[styles.teamInitials, { color: ACCENT }]}>
                    {event.team1?.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text numberOfLines={1} style={[styles.teamName, focused && { color: TEXT_PRIMARY }]}>
                {event.team1}
              </Text>
            </View>

            {/* VS */}
            <View style={styles.vsRow}>
              <View style={styles.vsLine} />
              <Text style={styles.vsText}>VS</Text>
              <View style={styles.vsLine} />
            </View>

            {/* Team 2 */}
            <View style={styles.teamRow}>
              {event.logo2 ? (
                <Image source={{ uri: event.logo2 }} style={styles.teamLogo} resizeMode="contain" />
              ) : (
                <View style={[styles.teamLogoFallback, { backgroundColor: ACCENT_DIM }]}>
                  <Text style={[styles.teamInitials, { color: ACCENT }]}>
                    {event.team2?.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text numberOfLines={1} style={[styles.teamName, focused && { color: TEXT_PRIMARY }]}>
                {event.team2 || '—'}
              </Text>
            </View>
          </View>

          {/* Footer */}
          {focused && hasVideo ? (
            <View style={[styles.footer, { backgroundColor: ACCENT }]}>
              <Text style={[styles.footerText, { color: '#000' }]}>WATCH NOW</Text>
            </View>
          ) : focused && !hasVideo ? (
            <View style={[styles.footer, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
              <Text style={[styles.footerText, { color: TEXT_DIM }]}>No disponible</Text>
            </View>
          ) : servers.length > 0 ? (
            <View style={styles.serverFooter}>
              <Text style={{ color: hasVideo ? ACCENT : TEXT_DIM, fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>
                {hasVideo ? 'LIVE' : 'OFFLINE'}
              </Text>
              <Text style={{ color: TEXT_DIM, fontSize: 9 }}> · </Text>
              <Text style={{ color: TEXT_DIM, fontSize: 9, fontWeight: '600' }}>
                {servers.length} {servers.length === 1 ? 'servidor' : 'servidores'}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </TvFocusable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 260,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(14,17,30,0.95)',
  },
  topBar: { height: 3 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  league: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#ef4444' },
  liveText: { color: '#ef4444', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  timePill: {
    backgroundColor: 'rgba(57,255,20,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timeText: { color: ACCENT, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 16 },
  teamsContainer: { padding: 16, paddingTop: 14 },
  teamRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  teamLogo: { width: 36, height: 36, marginRight: 12 },
  teamLogoFallback: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  teamInitials: { fontSize: 12, fontWeight: '900' },
  teamName: { color: '#e2e8f0', fontSize: 13, fontWeight: '800', flex: 1 },
  vsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  vsLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  vsText: { color: '#4B5563', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  footer: { paddingVertical: 11, alignItems: 'center' },
  footerText: { fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  serverFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
});
