import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client — REST over HTTPS, safe for serverless (no connection pool).
 *
 * Env vars are auto-injected by Vercel's Upstash integration:
 *   - UPSTASH_REDIS_REST_URL
 *   - UPSTASH_REDIS_REST_TOKEN
 *
 * Local dev: run `vercel env pull .env.local` after linking the project.
 */
export const redis = Redis.fromEnv();
