import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, doc, setDoc, getDoc, query, orderBy } from 'firebase/firestore';
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
  videoUrl?: string;
  servers?: ContentServer[];
  seasonsData?: SeasonData[];
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

  profiles: UserProfile[];
  currentProfile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  loadProfiles: (uid: string) => Promise<void>;
  addProfile: (uid: string, profile: Omit<UserProfile, 'id'>) => Promise<void>;
  logout: () => Promise<void>;

  cloudContent: ContentItem[];
  featuredEvents: FeaturedEvent[];
  channelFolders: ChannelFolder[];
  isLoadingContent: boolean;
  fetchCloudContent: () => Promise<void>;
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

      logout: async () => {
        try {
          await signOut(auth);
          set({ userId: null, currentProfile: null, profiles: [], myList: [], watchedEpisodes: [], watchHistory: [] });
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

      // CATÁLOGO
      cloudContent: [],
      featuredEvents: [],
      channelFolders: [],
      isLoadingContent: false,
      fetchCloudContent: async () => {
        if (!auth.currentUser) {
          console.log('[Store] fetchCloudContent: no Firebase user, skipping.');
          return;
        }

        set({ isLoadingContent: true });
        try {
          const [contentQuery, agendaQuery, nowfutbolQuery] = await Promise.all([
            getDocs(collection(db, 'content')),
            getDocs(query(collection(db, 'agenda'), orderBy('createdAt', 'desc'))),
            getDocs(query(collection(db, 'canales_carpetas'), orderBy('order', 'asc'))),
          ]);

          const items: ContentItem[] = [];
          contentQuery.forEach((doc) => { items.push({ id: doc.id, ...doc.data() } as ContentItem); });

          const events: FeaturedEvent[] = [];
          agendaQuery.forEach((doc) => { events.push(doc.data() as FeaturedEvent); });

          const nowfutbolFolders: ChannelFolder[] = [];
          nowfutbolQuery.forEach((doc) => { nowfutbolFolders.push(doc.data() as ChannelFolder); });

          let uniqueAngulismo: ChannelFolder[] = [];
          try {
            const angulismoQuery = await getDocs(collection(db, 'channelFolders'));
            const seenNames = new Set(nowfutbolFolders.map(f => f.name.toLowerCase().trim()));
            let angulismoIdx = 10000;
            angulismoQuery.forEach((doc) => {
              const folder = { ...doc.data() as ChannelFolder, order: angulismoIdx++ };
              if (!seenNames.has(folder.name.toLowerCase().trim())) {
                uniqueAngulismo.push(folder);
              }
            });
          } catch (angErr) {
            console.warn('channelFolders (angulismo) no disponible:', angErr);
          }

          const mergedFolders: ChannelFolder[] = [...nowfutbolFolders, ...uniqueAngulismo];

          set({
            cloudContent: items,
            featuredEvents: events,
            channelFolders: mergedFolders,
            isLoadingContent: false,
          });
        } catch (error) {
          console.error("Error al descargar catálogo:", error);
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
      }),
    }
  )
);