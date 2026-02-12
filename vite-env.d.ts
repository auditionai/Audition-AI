// Fix: Manually define Vite's `import.meta.env` types as a workaround for a missing type definition file.
// This resolves errors related to accessing environment variables in `utils/supabaseClient.ts`.
interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}