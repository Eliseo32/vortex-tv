import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAppStore } from '../store/useAppStore';

import LoginScreen from '../screens/auth/LoginScreen';
import ProfileScreen from '../screens/auth/ProfileScreen';
import TvHomeScreen from '../screens/tv/TvHomeScreen';
import TvDetailScreen from '../screens/tv/TvDetailScreen';
import TvPlayerScreen from '../screens/tv/TvPlayerScreen';
// 🔥 IMPORTAMOS LAS NUEVAS PANTALLAS DE PARTY
import TvPartySetupScreen from '../screens/tv/TvPartySetupScreen';
import TvPartyPlayerScreen from '../screens/tv/TvPartyPlayerScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { currentProfile, setUserId } = useAppStore();
  const [user, setUser] = useState<any>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setUserId(firebaseUser.uid);
      } else {
        setUserId(null);
      }
      setLoadingInitial(false);
    });
    return () => unsubscribe();
  }, []);

  if (loadingInitial) {
    return (
      <View className="flex-1 bg-[#050505] items-center justify-center">
        <ActivityIndicator size="large" color="#FACC15" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : !currentProfile ? (
        <Stack.Screen name="Profiles" component={ProfileScreen} />
      ) : (
        <Stack.Group>
          <Stack.Screen name="MainTV" component={TvHomeScreen} />
          <Stack.Screen name="DetailTV" component={TvDetailScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="PlayerTV" component={TvPlayerScreen} options={{ animation: 'fade' }} />
          
          {/* 🔥 REGISTRAMOS LAS RUTAS FALTANTES AQUÍ */}
          <Stack.Screen name="PartySetup" component={TvPartySetupScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="PartyPlayerTV" component={TvPartyPlayerScreen} options={{ animation: 'fade' }} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}