import { initializeApp } from 'firebase/app';
// 🔥 Importamos todo el módulo de auth normal (Expo lo lee sin problemas)
import * as FirebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAlFEw86A9Rj64mxhByuRih-kR2rC4Q4XE",
  authDomain: "vortex-dfae5.firebaseapp.com",
  projectId: "vortex-dfae5",
  storageBucket: "vortex-dfae5.firebasestorage.app",
  messagingSenderId: "663791465960",
  appId: "1:663791465960:web:284380e60d70a459e6a05d"
};

// Inicializamos la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// 🔥 LA SOLUCIÓN MÁGICA: 
// Usamos (FirebaseAuth as any) para silenciar a TypeScript. 
// De esta forma, Expo compila perfecto y la sesión se guarda en la memoria.
export const auth = FirebaseAuth.initializeAuth(app, {
  persistence: (FirebaseAuth as any).getReactNativePersistence(AsyncStorage)
});

// Exportamos la base de datos
export const db = getFirestore(app);