import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// Redirect chat root to messages tab
export default function ChatIndex() {
  const router = useRouter();
  useEffect(() => { router.replace('/(tabs)/messages'); }, [router]);
  return null;
}
