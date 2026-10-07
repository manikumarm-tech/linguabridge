import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { api, setBaseUrl, setToken } from '../api/client';
import type { User } from '../types';

interface AppState {
  ready: boolean;
  token: string | null;
  user: User | null;
  previewBeforeSend: boolean;
  apiUrl: string | null;
  hydrate: () => Promise<void>;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  updateSettings: (patch: Partial<User>) => Promise<void>;
  setPreviewBeforeSend: (v: boolean) => Promise<void>;
  setApiUrl: (u: string | null) => Promise<void>;
}

const KEY = 'linguabridge.v1';
const persist = (s: Pick<AppState, 'token' | 'user' | 'previewBeforeSend' | 'apiUrl'>) =>
  AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});

export const useApp = create<AppState>((set, get) => ({
  ready: false, token: null, user: null, previewBeforeSend: false, apiUrl: null,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.apiUrl) setBaseUrl(s.apiUrl);
        setToken(s.token ?? null);
        set({ token: s.token ?? null, user: s.user ?? null, previewBeforeSend: !!s.previewBeforeSend, apiUrl: s.apiUrl ?? null });
      }
    } finally {
      set({ ready: true });
    }
  },

  signIn: async (token, user) => {
    setToken(token);
    set({ token, user });
    await persist(get());
  },

  signOut: async () => {
    setToken(null);
    set({ token: null, user: null });
    await persist(get());
  },

  updateSettings: async (patch) => {
    const prev = get().user;
    if (!prev) return;
    set({ user: { ...prev, ...patch } }); // optimistic
    try {
      const user = await api.updateMe(patch);
      set({ user });
      await persist(get());
    } catch (e) {
      set({ user: prev });
      throw e;
    }
  },

  setPreviewBeforeSend: async (v) => { set({ previewBeforeSend: v }); await persist(get()); },
  setApiUrl: async (u) => {
    if (u) setBaseUrl(u);
    set({ apiUrl: u });
    await persist(get());
  },
}));
