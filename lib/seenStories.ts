import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'loop_seen_stories';

export async function getSeenUserIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export async function markUserSeen(userId: string): Promise<void> {
  try {
    const seen = await getSeenUserIds();
    seen.add(userId);
    await AsyncStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {}
}
