/**
 * Standalone connection check for Upstash Redis.
 * Run with: npx tsx scripts/redis-check.ts
 *
 * Passes if it can round-trip a value in under a second.
 */
import "dotenv/config";
import { redis } from "../lib/redis";

async function main() {
  const key = `healthcheck:${process.pid}`;
  const value = `ok-${Date.now()}`;

  const t0 = Date.now();
  await redis.set(key, value, { ex: 10 });
  const got = await redis.get<string>(key);
  await redis.del(key);
  const ms = Date.now() - t0;

  if (got !== value) {
    console.error(`FAIL — expected ${value}, got ${got}`);
    process.exit(1);
  }
  console.log(`OK — round-trip in ${ms}ms`);
}

main().catch((err) => {
  console.error("FAIL —", err?.message ?? err);
  process.exit(1);
});
