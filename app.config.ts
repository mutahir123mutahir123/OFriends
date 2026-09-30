import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Client-side Supabase credentials.
 *
 * These MUST exist at bundle time. `lib/supabase.ts` constructs the client at
 * module scope, so a missing value throws during bundle initialisation — before
 * React renders — and the installed app dies a second after the splash screen.
 * A local `.env.local` cannot rescue a cloud build: it is gitignored, so EAS
 * Build never receives it. Only EAS environment variables reach the bundle.
 */
const REQUIRED_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const;

function describeHowToFix(missing: string[]): string {
  const commands = missing
    .map((name) => `  eas env:set --name ${name} --value "<value>" --environment <production|preview> --visibility plaintext`)
    .join('\n');

  return [
    '',
    'Missing required environment variable(s): ' + missing.join(', '),
    '',
    'A build profile resolves its variables from ONE EAS environment. Check that the',
    'variables live in the environment that `eas.json` maps that profile to, via its',
    '`environment` field. A profile with no `environment` falls back to "production"',
    'whenever its distribution is "store", which is EAS\'s default — a "preview"',
    'profile can therefore silently read an empty "production" environment.',
    '',
    'Set them in the environment this build profile actually uses:',
    commands,
    '',
    'Use --visibility plaintext or sensitive. A "secret" variable is never inlined',
    'into the JavaScript bundle, so it will fail here again.',
  ].join('\n');
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const isBuildContext =
    process.env.EAS_BUILD === 'true' ||
    process.env.EXPO_BUILD_ENV === 'true' ||
    process.env.CI === 'true';

  const missing = REQUIRED_ENV.filter((name) => (process.env[name] ?? '').trim() === '');

  if (isBuildContext && missing.length > 0) {
    throw new Error(describeHowToFix([...missing]));
  }

  // Still validate format if present (useful for local dev/builds)
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (url && !/^https?:\/\/\S+$/.test(url)) {
    throw new Error(
      `EXPO_PUBLIC_SUPABASE_URL is not a valid URL (got ${JSON.stringify(url)}). ` +
        'Check the value for stray quotes or trailing whitespace in EAS.'
    );
  }

  return { ...config } as ExpoConfig;
};