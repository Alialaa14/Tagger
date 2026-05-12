import { configDotenv } from "dotenv";

configDotenv();

if (!process.env.MONGO_URI) {
  console.error("❌ CRITICAL ERROR: MONGO_URI is not defined in environment variables.");
  console.error("If you are running in Docker, ensure you are using 'docker-compose' or passing '--env-file .env'.");
  process.exit(1);
}

export const ENV = {
  PORT: process.env.PORT || 3000,
  MONGO_URI: process.env.MONGO_URI,
  ACCESS_TOKEN: process.env.ACCESS_TOKEN,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY || "3d",
  REFRESH_TOKEN: process.env.REFRESH_TOKEN,
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || "7d",
  CLOUDINARY: {
    CLOUD_API_KEY: process.env.CLOUD_API_KEY,
    CLOUD_API_SECRET: process.env.CLOUD_API_SECRET,
    CLOUD_NAME: process.env.CLOUD_NAME,
  },
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  GMAIL_EMAIL: process.env.GMAIL_EMAIL,
  GMAIL_PASSWORD: process.env.GMAIL_PASSWORD,
  NODE_ENV: process.env.NODE_ENV || "development",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:5371",
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  SESSION_SECRET: process.env.SESSION_SECRET,
};
