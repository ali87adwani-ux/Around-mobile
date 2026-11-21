import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { SUPABASE_KEY, SUPABASE_URL } from '@/config';

// .env values win over the defaults in src/config. EXPO_PUBLIC_DEMO=1 forces demo mode (used by the web preview).
const demo = process.env.EXPO_PUBLIC_DEMO === '1';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY || SUPABASE_KEY;

export const backendEnabled = !demo && !!(url && key);

export const supabase: SupabaseClient | null = backendEnabled
  ? createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
    })
  : null;
