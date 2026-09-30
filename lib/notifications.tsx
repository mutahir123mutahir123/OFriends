import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { playNotificationSound } from './notificationSound';

type LiveNotification = {
  id: string;
  type: 'like' | 'comment' | 'follow';
  actor_id: string;
  post_id?: string;
  created_at: string;
};

type NotificationsContextType = {
  unreadCount: number;
  markAllRead: () => void;
};

const NotificationsContext = createContext<NotificationsContextType>({ unreadCount: 0, markAllRead: () => {} });

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [myPostIds, setMyPostIds] = useState<Set<string>>(new Set());
  const processedKeys = useRef(new Set<string>());

  // Keep the user's post IDs updated
  useEffect(() => {
    void (async () => {
      if (!user) { setMyPostIds(new Set()); return; }
      const { data } = await supabase.from('posts').select('id').eq('user_id', user.id);
      setMyPostIds(new Set((data ?? []).map((p: any) => p.id)));
    })();
  }, [user]);

  const processNotification = useCallback((n: LiveNotification) => {
    const key = `${n.type}_${n.actor_id}_${n.post_id ?? ''}_${n.created_at}`;
    if (processedKeys.current.has(key)) return;
    processedKeys.current.add(key);
    setUnreadCount((c) => c + 1);
    playNotificationSound();
  }, []);

  useEffect(() => {
    if (!user) return;
    processedKeys.current.clear();

    const checkAndNotify = async (type: LiveNotification['type'], row: any) => {
      if (type === 'follow') {
        // Follow: notify if someone followed the current user
        if (row.following_id === user.id && row.follower_id !== user.id) {
          processNotification({
            id: `follow_${row.follower_id}`,
            type: 'follow',
            actor_id: row.follower_id,
            created_at: row.created_at,
          });
        }
        return;
      }

      // Likes & Comments: only notify if the post belongs to current user
      const postId = row.post_id;
      if (!postId || row.user_id === user.id) return;
      if (!myPostIds.has(postId)) return;

      processNotification({
        id: `${type}_${row.id ?? row.user_id}`,
        type,
        actor_id: row.user_id,
        post_id: postId,
        created_at: row.created_at ?? new Date().toISOString(),
      });
    };

    const channel = supabase
      .channel('live-notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'likes' },
        (payload) => checkAndNotify('like', payload.new)
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        (payload) => checkAndNotify('comment', payload.new)
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'follows' },
        (payload) => checkAndNotify('follow', payload.new)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, myPostIds, processNotification]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, markAllRead: () => setUnreadCount(0) }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
