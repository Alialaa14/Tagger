import mongoose from "mongoose";
import PlatformSetting from "../src/models/platformSetting.model.js";
import { configDotenv } from "dotenv";

configDotenv();

const seedSettings = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for seeding...");

    const defaultSettings = {
      autoForward: true,
      orderTimeoutMinutes: 5,
      requirePaymentProof: true,
      priceCeilingEnabled: true,
      defaultLowStockThreshold: 10,
      platformCommissionRate: 0,
    };

    const doc = await PlatformSetting.findOneAndUpdate(
      {},
      { $set: defaultSettings },
      { upsert: true, new: true }
    );

    console.log("Seeded platform settings document:", doc);
    console.log("Seeding completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding settings:", error);
    process.exit(1);
  }
};

seedSettings();
