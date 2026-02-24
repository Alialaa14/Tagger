import { configDotenv } from "dotenv";

configDotenv();

export const ENV = {
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
  ACCESS_TOKEN: process.env.ACCESS_TOKEN,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN: process.env.REFRESH_TOKEN,
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY,
  CLOUDINARY: {
    CLOUD_API_KEY: process.env.CLOUD_API_KEY,
    CLOUD_API_SECRET: process.env.CLOUD_API_SECRET,
    CLOUD_NAME: process.env.CLOUD_NAME,
  },
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  GMAIL_EMAIL: process.env.GMAIL_EMAIL,
  GMAIL_PASSWORD: process.env.GMAIL_PASSWORD,
  NODE_ENV: process.env.NODE_ENV,
};
