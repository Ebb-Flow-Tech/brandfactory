import {
  type AuthProvider,
  createLocalAuthProvider,
  createSupabaseAuthProvider,
} from '@brandfactory/adapter-auth'
import {
  type BlobStore,
  createLocalDiskBlobStore,
  createSupabaseBlobStore,
} from '@brandfactory/adapter-storage'
import { type NativeWsRealtimeBus, createNativeWsRealtimeBus } from '@brandfactory/adapter-realtime'
import {
  type LLMProvider,
  type LLMProviderConfig,
  createLLMProvider,
} from '@brandfactory/adapter-llm'
import type { Env } from './env'

// Realtime is a discriminated union so consumers that need provider-specific
// capabilities (e.g. `main.ts` calls `bindToNodeWebSocketServer` on the
// native-ws bus) can narrow without an `as` cast. When a second impl lands,
// add another branch here and let TS surface the missing case at every wire-up
// site.
export type RealtimeAdapter = { provider: 'native-ws'; bus: NativeWsRealtimeBus }

export interface Adapters {
  auth: AuthProvider
  storage: BlobStore
  realtime: RealtimeAdapter
  llm: LLMProvider
}

export function buildAdapters(env: Env): Adapters {
  const auth: AuthProvider =
    env.AUTH_PROVIDER === 'local'
      ? createLocalAuthProvider()
      : createSupabaseAuthProvider({
          jwksUrl: env.SUPABASE_JWKS_URL!,
          audience: env.SUPABASE_JWT_AUDIENCE,
          issuer: env.SUPABASE_JWT_ISSUER,
        })

  const storage: BlobStore =
    env.STORAGE_PROVIDER === 'local-disk'
      ? createLocalDiskBlobStore({
          rootDir: env.BLOB_LOCAL_DISK_ROOT!,
          signingSecret: env.BLOB_SIGNING_SECRET!,
          publicBaseUrl: env.BLOB_PUBLIC_BASE_URL!,
        })
      : createSupabaseBlobStore({
          url: env.SUPABASE_URL!,
          serviceKey: env.SUPABASE_SERVICE_KEY!,
          bucket: env.SUPABASE_STORAGE_BUCKET!,
        })

  // Only one realtime impl ships in Phase 3; widen the discriminated union
  // and the `RealtimeAdapter` type together as more land (decision 15).
  //
  // Single-instance commitment: `native-ws` is an in-process pub/sub —
  // subscribers live in a `Map` on this Node heap. Running more than one
  // server instance (Fly `scale count 2`, k8s `replicas > 1`, etc.)
  // silently drops cross-instance fan-out: a canvas-op published on
  // Machine A never reaches a subscriber on Machine B. Deploys that need
  // horizontal scale must land a second `RealtimeAdapter` branch first
  // (Supabase Realtime / Redis pub-sub / etc.) — see
  // docs/executing/hosted-deployment-plan.md Question 3.
  const realtime: RealtimeAdapter = { provider: 'native-ws', bus: createNativeWsRealtimeBus() }

  const llmConfig: LLMProviderConfig = {}
  if (env.ANTHROPIC_API_KEY) {
    llmConfig.anthropic = { apiKey: env.ANTHROPIC_API_KEY }
  }
  if (env.OPENAI_API_KEY) {
    llmConfig.openai = { apiKey: env.OPENAI_API_KEY }
  }
  if (env.OPENROUTER_API_KEY) {
    llmConfig.openrouter = {
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
    }
  }
  llmConfig.ollama = { baseURL: env.OLLAMA_BASE_URL }
  const llm: LLMProvider = createLLMProvider(llmConfig)

  return { auth, storage, realtime, llm }
}
