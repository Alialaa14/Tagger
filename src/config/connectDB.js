import mongoose from "mongoose";
import { ENV } from "../utils/ENV.js";

export const connectDB = async () => {
  try {
    await mongoose.connect(ENV.MONGO_URI);
    console.log(
      "Connected to the database successfully with host-",
      mongoose.connection.host,
    );
  } catch (error) {
    console.log("Error connecting to the database:", error.message);
    process.exit(1); // Exit the process with an error code
  }
};
