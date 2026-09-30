import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSeenUserIds } from '@/lib/seenStories';

export function useStories() {
  const [stories, setStories] = useState<any[]>([]);
  const [seenUserIds, setSeenUserIds] = useState<Set<string>>(new Set());

  const fetchStories = useCallback(async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('stories')
      .select('*, profiles(id, username, avatar_url)')
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (data) {
      // Deduplicate: one ring per user (keep the most recent story per user)
      const seenIds = new Set<string>();
      const unique = data.filter((story: any) => {
        if (seenIds.has(story.user_id)) return false;
        seenIds.add(story.user_id);
        return true;
      });
      setStories(unique);
    }
  }, []);

  const fetchSeen = useCallback(async () => {
    const seen = await getSeenUserIds();
    setSeenUserIds(seen);
  }, []);

  const refresh = useCallback(() => {
    fetchStories();
    fetchSeen();
  }, [fetchStories, fetchSeen]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  return { stories, seenUserIds, refresh };
}
