import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type FeedMode = 'following' | 'discover';

export function useFeed(userId: string, mode: FeedMode = 'following') {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let data: any[] = [];

      if (mode === 'following') {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId);

        const ids = (follows ?? []).map((f: any) => f.following_id);

        if (ids.length === 0) {
          setPosts([]);
          return;
        }

        const { data: postsData } = await supabase
          .from('posts')
          .select('*, profiles(id, username, avatar_url)')
          .in('user_id', ids)
          .order('created_at', { ascending: false })
          .limit(30);

        data = postsData ?? [];
      } else {
        const { data: postsData } = await supabase
          .from('posts')
          .select('*, profiles(id, username, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(30);

        data = postsData ?? [];
      }

      // Enrich with like counts and whether current user liked each post
      if (data.length > 0) {
        const postIds = data.map((p: any) => p.id);
        const { data: likesData } = await supabase
          .from('likes')
          .select('post_id, user_id')
          .in('post_id', postIds);

        const myLikePostIds = new Set<string>();
        const likesCount = new Map<string, number>();

        for (const like of likesData ?? []) {
          likesCount.set(like.post_id, (likesCount.get(like.post_id) ?? 0) + 1);
          if (like.user_id === userId) {
            myLikePostIds.add(like.post_id);
          }
        }

        data = data.map((post: any) => ({
          ...post,
          likes_count: likesCount.get(post.id) ?? 0,
          is_liked_by_me: myLikePostIds.has(post.id),
        }));
      }

      setPosts(data);
    } finally {
      setLoading(false);
    }
  }, [userId, mode]);

  useEffect(() => {
    void (async () => {
      await fetchPosts();
    })();
  }, [fetchPosts]);

  // Realtime subscription for live like count updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`feed-likes-${userId}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'likes' },
        (payload) => {
          const like = payload.new as any;
          const oldLike = payload.old as any;
          const likePostId = like?.post_id ?? oldLike?.post_id;
          if (!likePostId) return;

          setPosts((prev) =>
            prev.map((post) => {
              if (post.id !== likePostId) return post;
              let delta = 0;
              let likedByMe = post.is_liked_by_me;
              if (payload.eventType === 'INSERT') {
                delta = 1;
                if (like.user_id === userId) likedByMe = true;
              } else if (payload.eventType === 'DELETE') {
                delta = -1;
                if (oldLike?.user_id === userId) likedByMe = false;
              }
              return { ...post, likes_count: Math.max(0, (post.likes_count ?? 0) + delta), is_liked_by_me: likedByMe };
            })
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return { posts, loading, refresh: fetchPosts };
}
