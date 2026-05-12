import IORedis from "ioredis";
import { ENV } from "./ENV.js";

let redis = null;
let isMockMode = false;

try {
  redis = new IORedis(ENV.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ for blocking connections
    connectTimeout: 5000,
    lazyConnect: true // Don't connect until used
  });

  redis.on("error", (err) => {
    if (!isMockMode) {
      console.warn("⚠️ Redis Connection Failed. Entering Mock Mode (In-Memory Fallback).");
      isMockMode = true;
    }
  });

} catch (error) {
  console.warn("⚠️ Redis initialization failed. Entering Mock Mode.");
  isMockMode = true;
}

/**
 * getRedisClient
 * Returns the Redis client or null if in mock mode.
 */
export const getRedisClient = () => redis;

export const checkIsMockMode = () => isMockMode;

export default redis;
