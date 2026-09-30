import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useMessages(currentUserId: string, receiverId: string) {
  const [messages, setMessages] = useState<any[]>([]);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  }, [currentUserId, receiverId]);

  useEffect(() => {
    void (async () => {
      await fetch();
    })();

    const channel = supabase
      .channel(`msg_${currentUserId}_${receiverId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any;
        const isOurs = (msg.sender_id === currentUserId && msg.receiver_id === receiverId)
          || (msg.sender_id === receiverId && msg.receiver_id === currentUserId);
        if (isOurs) setMessages((prev) => [...prev, msg]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, receiverId, fetch]);

  return { messages };
}
