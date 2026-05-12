import PlatformSetting from "../models/platformSetting.model.js";
import redis, { checkIsMockMode } from "./redis.js";

const SETTINGS_CACHE_KEY = "platform_settings";

/**
 * getPlatformSettings
 * Fetches the singleton settings document.
 * Returns defaults if no document exists.
 */
export const getPlatformSettings = async () => {
  try {
    // 1. Try Cache (if not in Mock Mode)
    if (!checkIsMockMode()) {
      try {
        const cached = await redis.get(SETTINGS_CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch (cacheError) {
        console.warn("[Settings] Cache read failed, falling back to DB.");
      }
    }

    // 2. Fetch from DB
    let settings = await PlatformSetting.findOne();
    
    // If no settings exist yet, create default one
    if (!settings) {
      settings = await PlatformSetting.create({});
    }

    // 3. Update Cache (if not in Mock Mode)
    if (!checkIsMockMode()) {
      try {
        await redis.set(SETTINGS_CACHE_KEY, JSON.stringify(settings), "EX", 3600);
      } catch (cacheError) {
        // Silently fail cache writes
      }
    }

    return settings;
  } catch (error) {
    console.error("Error fetching platform settings:", error);
    // Return safe defaults if DB fails
    return {
      autoForward: true,
      orderTimeoutMinutes: 5,
      requirePaymentProof: true,
      defaultLowStockThreshold: 10,
      priceCeilingEnabled: true
    };
  }
};

/**
 * updatePlatformSettings
 * Updates the singleton settings and clears cache.
 */
export const updatePlatformSettings = async (updateData) => {
  try {
    const settings = await PlatformSetting.findOneAndUpdate(
      {},
      { $set: updateData },
      { upsert: true, new: true }
    );

    // Clear Cache (if not in Mock Mode)
    if (!checkIsMockMode()) {
      try {
        await redis.set(SETTINGS_CACHE_KEY, JSON.stringify(settings), "EX", 3600);
      } catch (cacheError) { }
    }

    return settings;
  } catch (error) {
    console.error("Error updating platform settings:", error);
    throw error;
  }
};
