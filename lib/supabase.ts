import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

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
          type: 'picture' | 'reel';
          media_url: string;
          caption: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: 'picture' | 'reel';
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
