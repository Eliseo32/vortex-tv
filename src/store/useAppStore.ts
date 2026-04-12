import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, doc, setDoc, getDoc, query, orderBy, limit, startAfter, DocumentSnapshot, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../config/firebase';

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface ContentServer { name: string; url: string; }
export interface SeasonData { season: number; episodes: number; }

export interface ContentItem {
  id: string;
  tmdb_id?: string;
  type: string;
  title: string;
  year: string;
  genre: string;
  poster: string;
  backdrop: string;
  description: string;
  rating: string;
  imdbRating?: string;
  genres?: string[];
  videoUrl?: string;
  servers?: ContentServer[];
  seasonsData?: SeasonData[];
  updatedAt?: number;
}

export interface FeaturedEvent {
  id: string;
  date: string;
  time: string;
  category: string;
  league: string;
  team1: string;
  team2: string;
  logo1: string | null;
  logo2: string | null;
  status: string;           // "⚪ PROGRAMADO" | "🔴 EN VIVO"
  videoUrl: string | null;  // Primer servidor (para compatibilidad)
  servers: string[];        // Todos los iframes como array de URLs
  opciones: Record<string, string>; // "Opción 1" → URL
  createdAt: number;
}

export interface ChocopopEvent {
  id: string;
  title: string;
  team1: string;
  team2: string;
  league: string;
  backdrop: string | null;
  videoUrl: string;
  eventDate: string;        // ISO UTC original (para countdown exacto)
  timeAR: string;           // "HH:MM" hora Argentina
  dateAR: string;           // "YYYY-MM-DD" fecha Argentina
  status: 'live' | 'soon';  // nunca "ended"
  logo1: string | null;
  logo2: string | null;
  description: string;
  year: string;
  createdAt: number;
}


// 🔥 NUEVA INTERFAZ PARA EL HISTORIAL
export interface HistoryItem {
  item: ContentItem;
  season?: number;
  episode?: number;
  timestamp: number;
}

export interface ChannelOption {
  name: string;
  iframe: string;
}

export interface ChannelFolder {
  id: string;
  name: string;
  logo: string | null;
  options: ChannelOption[];
  order: number;
  genre?: string; // Categoría TV Libre: Argentina, Deportes, etc.
}

interface AppState {
  myList: string[];
  watchedEpisodes: string[];
  toggleMyList: (id: string) => void;
  isInMyList: (id: string) => boolean;
  markAsWatched: (episodeKey: string) => void;
  isWatched: (episodeKey: string) => boolean;

  // 🔥 HISTORIAL
  watchHistory: HistoryItem[];
  addToHistory: (item: ContentItem, season?: number, episode?: number) => void;

  // AUTENTICACIÓN Y PERFILES
  userId: string | null;
  setUserId: (id: string | null) => void;

  userAvatar: string | null;
  availableAvatars: string[];
  setUserAvatar: (url: string) => void;

  profiles: UserProfile[];
  currentProfile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  loadProfiles: (uid: string) => Promise<void>;
  addProfile: (uid: string, profile: Omit<UserProfile, 'id'>) => Promise<void>;
  updateProfile: (uid: string, profileId: string, updates: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;

  cloudContent: ContentItem[];
  featuredEvents: FeaturedEvent[];
  chocopopEvents: ChocopopEvent[];    // Eventos deportivos de chocopopflow.com
  channelFolders: ChannelFolder[];    // canales_carpetas + channelFolders (angulismo) → Deportes
  tvlibreChannels: ChannelFolder[];   // TV Libre → TV en Vivo
  isLoadingContent: boolean;
  contentLastDoc: DocumentSnapshot | null;  // Cursor para paginación global (obsoleto)
  moviesLastDoc: any;
  seriesLastDoc: any;
  animeLastDoc: any;
  fetchCloudContent: () => Promise<void>;
  fetchMoreContent: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      myList: [],
      watchedEpisodes: [],
      watchHistory: [],

      toggleMyList: (id) => set((state) => {
        const list = state.myList;
        return list.includes(id) ? { myList: list.filter((item) => item !== id) } : { myList: [...list, id] };
      }),
      isInMyList: (id) => get().myList.includes(id),

      markAsWatched: (episodeKey) => set((state) => {
        if (state.watchedEpisodes.includes(episodeKey)) return state;
        return { watchedEpisodes: [...state.watchedEpisodes, episodeKey] };
      }),
      isWatched: (episodeKey) => get().watchedEpisodes.includes(episodeKey),

      // 🔥 LÓGICA DEL HISTORIAL (Mueve el item al principio si ya existía)
      addToHistory: (item, season, episode) => set((state) => {
        const filtered = state.watchHistory.filter(h => h.item.id !== item.id);
        const newEntry = { item, season, episode, timestamp: Date.now() };
        return { watchHistory: [newEntry, ...filtered] };
      }),

      // AUTENTICACIÓN
      userId: null,
      setUserId: (id) => set({ userId: id }),
      profiles: [],
      currentProfile: null,
      setProfile: (profile) => set({ currentProfile: profile }),

      // SISTEMA DE AVATARES
      userAvatar: null,
      availableAvatars: [
        'https://picsum.photos/seed/vortex1/300/300',
        'https://picsum.photos/seed/vortex2/300/300',
        'https://picsum.photos/seed/neon3/300/300',
        'https://picsum.photos/seed/cyber4/300/300',
        'https://picsum.photos/seed/synth5/300/300',
        'https://picsum.photos/seed/retro6/300/300',
        'https://picsum.photos/seed/future7/300/300',
        'https://picsum.photos/seed/oled8/300/300',
      ],
      setUserAvatar: (url) => set({ userAvatar: url }),

      logout: async () => {
        try {
          await signOut(auth);
          set({ userId: null, currentProfile: null, profiles: [], myList: [], watchedEpisodes: [], watchHistory: [], userAvatar: null });
        } catch (e) { console.error("Error al cerrar sesión", e); }
      },

      loadProfiles: async (uid) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists() && userDoc.data().profiles) {
            set({ profiles: userDoc.data().profiles });
          } else {
            const defaultProfile = { id: Date.now().toString(), name: 'Admin', avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=${uid}`, color: '#B026FF' };
            await setDoc(doc(db, 'users', uid), { profiles: [defaultProfile] }, { merge: true });
            set({ profiles: [defaultProfile] });
          }
        } catch (error) { console.error("Error cargando perfiles:", error); }
      },

      addProfile: async (uid, profileData) => {
        try {
          const newProfile = { id: Date.now().toString(), ...profileData };
          const updatedProfiles = [...get().profiles, newProfile];
          await setDoc(doc(db, 'users', uid), { profiles: updatedProfiles }, { merge: true });
          set({ profiles: updatedProfiles });
        } catch (error) { console.error("Error creando perfil:", error); }
      },

      updateProfile: async (uid, profileId, updates) => {
        try {
          const currentProfiles = get().profiles;
          const updatedProfiles = currentProfiles.map(p => 
            p.id === profileId ? { ...p, ...updates } : p
          );
          await setDoc(doc(db, 'users', uid), { profiles: updatedProfiles }, { merge: true });
          set({ profiles: updatedProfiles });
          
          if (get().currentProfile?.id === profileId) {
            set({ currentProfile: { ...get().currentProfile!, ...updates } });
          }
        } catch (error) { console.error("Error actualizando perfil:", error); }
      },

      // CATÁLOGO
      cloudContent: [],
      featuredEvents: [],
      chocopopEvents: [],
      channelFolders: [],
      tvlibreChannels: [],
      isLoadingContent: false,
      contentLastDoc: null,
      moviesLastDoc: null,
      seriesLastDoc: null,
      animeLastDoc: null,
      fetchCloudContent: async () => {
        set({ isLoadingContent: true });
        try {
          // Carga inicial rápida: solo 10 de cada uno para arrancar velozmente
          const PER_TYPE_LIMIT = 10;
          const [moviesSnap, seriesSnap, animeSnap, agendaQuery, chocopopEventsQuery] = await Promise.all([
            getDocs(query(collection(db, 'content'), where('type', '==', 'movie'), orderBy('year', 'desc'), limit(PER_TYPE_LIMIT))),
            getDocs(query(collection(db, 'content'), where('type', '==', 'series'), orderBy('year', 'desc'), limit(PER_TYPE_LIMIT))),
            getDocs(query(collection(db, 'content'), where('type', '==', 'anime'), orderBy('year', 'desc'), limit(PER_TYPE_LIMIT))),
            getDocs(query(collection(db, 'agenda'), orderBy('createdAt', 'desc'))),
            getDocs(query(collection(db, 'chocopopEvents'), orderBy('eventDate', 'asc'))),
          ]);

          const items: ContentItem[] = [];
          
          moviesSnap.forEach((doc) => { items.push({ id: doc.id, ...doc.data() } as ContentItem); });
          seriesSnap.forEach((doc) => { items.push({ id: doc.id, ...doc.data() } as ContentItem); });
          animeSnap.forEach((doc) => { items.push({ id: doc.id, ...doc.data() } as ContentItem); });
          
          // Guardamos los cursores de cada tipo para continuar paginando
          const moviesLastDoc = moviesSnap.docs[moviesSnap.docs.length - 1] || null;
          const seriesLastDoc = seriesSnap.docs[seriesSnap.docs.length - 1] || null;
          const animeLastDoc = animeSnap.docs[animeSnap.docs.length - 1] || null;

          const events: FeaturedEvent[] = [];
          agendaQuery.forEach((doc) => { events.push(doc.data() as FeaturedEvent); });

          const chocopopEvts: ChocopopEvent[] = [];
          chocopopEventsQuery.forEach((doc) => { chocopopEvts.push(doc.data() as ChocopopEvent); });

          // ── channelFolders: canales_carpetas + angulismo → para Deportes ──
          let nowfutbolFolders: ChannelFolder[] = [];
          try {
            const nowfutbolQuery = await getDocs(query(collection(db, 'canales_carpetas'), orderBy('order', 'asc')));
            nowfutbolQuery.forEach((doc) => { nowfutbolFolders.push(doc.data() as ChannelFolder); });
          } catch (e) { console.warn('canales_carpetas no disponible:', e); }

          let uniqueAngulismo: ChannelFolder[] = [];
          try {
            const angulismoQuery = await getDocs(collection(db, 'channelFolders'));
            const seenNames = new Set(nowfutbolFolders.map(f => f.name.toLowerCase().trim()));
            let angIdx = 10000;
            angulismoQuery.forEach((doc) => {
              const folder = { ...doc.data() as ChannelFolder, order: angIdx++ };
              if (!seenNames.has(folder.name.toLowerCase().trim())) uniqueAngulismo.push(folder);
            });
          } catch (e) { console.warn('channelFolders (angulismo) no disponible:', e); }

          // ── TV Libre: solo para TV en Vivo ──
          let tvlibreChannels: ChannelFolder[] = [];
          try {
            const tvlibreQuery = await getDocs(query(collection(db, 'tvlibre_channels'), orderBy('order', 'asc')));
            tvlibreQuery.forEach((docSnap) => {
              const data = docSnap.data();
              if (data.channels && Array.isArray(data.channels)) {
                data.channels.forEach((ch: any, idx: number) => {
                  tvlibreChannels.push({
                    id: `tvlibre-${docSnap.id}-${idx}`,
                    name: ch.name,
                    logo: ch.logo || null,
                    genre: data.name,
                    options: (ch.options || []).map((opt: any) => ({
                      name: opt.name || ch.name,
                      iframe: opt.iframe || '',
                    })),
                    order: (data.order || 0) * 1000 + idx,
                  });
                });
              }
            });
          } catch (e) { console.warn('tvlibre_channels no disponible:', e); }

          set({
            cloudContent: items,
            featuredEvents: events,
            chocopopEvents: chocopopEvts,
            channelFolders: [...nowfutbolFolders, ...uniqueAngulismo],
            tvlibreChannels,
            moviesLastDoc,
            seriesLastDoc,
            animeLastDoc,
            isLoadingContent: false,
          });
        } catch (error) {
          console.error("Error al descargar catálogo:", error);
          set({ isLoadingContent: false });
        }
      },

      fetchMoreContent: async () => {
        const { moviesLastDoc, seriesLastDoc, animeLastDoc, cloudContent, isLoadingContent } = get();
        if ((!moviesLastDoc && !seriesLastDoc && !animeLastDoc) || isLoadingContent) return;

        set({ isLoadingContent: true });
        try {
          // Ajustado de 50 a 20 para hacer progresiones más cortas como solicitado
          const PAGE_SIZE = 20;
          
          // Solo armamos queries si tenemos cursor válido
          const qMovies = moviesLastDoc ? query(collection(db, 'content'), where('type', '==', 'movie'), orderBy('year', 'desc'), startAfter(moviesLastDoc), limit(PAGE_SIZE)) : null;
          const qSeries = seriesLastDoc ? query(collection(db, 'content'), where('type', '==', 'series'), orderBy('year', 'desc'), startAfter(seriesLastDoc), limit(PAGE_SIZE)) : null;
          const qAnime = animeLastDoc ? query(collection(db, 'content'), where('type', '==', 'anime'), orderBy('year', 'desc'), startAfter(animeLastDoc), limit(PAGE_SIZE)) : null;

          const [moviesSnap, seriesSnap, animeSnap] = await Promise.all([
            qMovies ? getDocs(qMovies) : Promise.resolve({ docs: [], forEach: () => {} }),
            qSeries ? getDocs(qSeries) : Promise.resolve({ docs: [], forEach: () => {} }),
            qAnime ? getDocs(qAnime) : Promise.resolve({ docs: [], forEach: () => {} }),
          ]);

          const newItems: ContentItem[] = [];
          moviesSnap.forEach((doc: any) => { newItems.push({ id: doc.id, ...doc.data() } as ContentItem); });
          seriesSnap.forEach((doc: any) => { newItems.push({ id: doc.id, ...doc.data() } as ContentItem); });
          animeSnap.forEach((doc: any) => { newItems.push({ id: doc.id, ...doc.data() } as ContentItem); });

          // Filtrar duplicados por seguridad (Firebase a veces repite en paginación con startAfter sin orderBy exacto)
          const currentIds = new Set(cloudContent.map(i => i.id));
          const uniqueNewItems = newItems.filter(i => !currentIds.has(i.id));

          set({
            cloudContent: [...cloudContent, ...uniqueNewItems],
            moviesLastDoc: moviesSnap.docs.length > 0 ? moviesSnap.docs[moviesSnap.docs.length - 1] : moviesLastDoc,
            seriesLastDoc: seriesSnap.docs.length > 0 ? seriesSnap.docs[seriesSnap.docs.length - 1] : seriesLastDoc,
            animeLastDoc: animeSnap.docs.length > 0 ? animeSnap.docs[animeSnap.docs.length - 1] : animeLastDoc,
            isLoadingContent: false,
          });
        } catch (e) {
          console.error('Error cargando más contenido:', e);
          set({ isLoadingContent: false });
        }
      },
    }),
    {
      name: 'vortex-storage', // Nombre de la base local
      storage: createJSONStorage(() => AsyncStorage),
      // Solo persistimos datos del usuario — el catálogo siempre viene fresco de Firestore
      partialize: (state) => ({
        myList: state.myList,
        watchedEpisodes: state.watchedEpisodes,
        watchHistory: state.watchHistory,
        userAvatar: state.userAvatar,
      }),
    }
  )
);