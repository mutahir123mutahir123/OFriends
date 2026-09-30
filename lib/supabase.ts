import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

function requireEnv(name: string, value: string | undefined): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `${name} is missing from the JS bundle. EXPO_PUBLIC_ values are inlined at ` +
        `build time, so this must be an EAS environment variable — a .env.local file ` +
        `is gitignored and never reaches EAS Build.`
    );
  }
  return value.trim();
}

export const supabaseUrl = requireEnv('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

if (!/^https?:\/\/\S+$/.test(supabaseUrl)) {
  throw new Error(
    `EXPO_PUBLIC_SUPABASE_URL is not a valid URL (got ${JSON.stringify(supabaseUrl)}). ` +
      'Check the EAS variable for stray quotes or trailing whitespace.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
        };
        Update: {
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
        };
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          type: 'picture';
          media_url: string;
          caption: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: 'picture';
          media_url: string;
          caption?: string | null;
        };
      };
      stories: {
        Row: {
          id: string;
          user_id: string;
          media_url: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          media_url: string;
          expires_at: string;
        };
      };
      follows: {
        Row: {
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          following_id: string;
        };
      };
      likes: {
        Row: {
          id: string;
          user_id: string;
          post_id: string;
        };
        Insert: {
          user_id: string;
          post_id: string;
        };
      };
      comments: {
        Row: {
          id: string;
          user_id: string;
          post_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          post_id: string;
          content: string;
        };
      };
      messages: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          text: string;
          created_at: string;
        };
        Insert: {
          sender_id: string;
          receiver_id: string;
          text: string;
        };
      };
    };
  };
};
