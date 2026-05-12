import { Schema, model } from "mongoose";

const platformSettingSchema = new Schema(
  {
    // --- Order & Forwarding Logic ---
    autoForward: {
      type: Boolean,
      default: true,
      description: "Enable/Disable automatic trader selection and forwarding.",
    },
    orderTimeoutMinutes: {
      type: Number,
      default: 5,
      description: "How long to wait for a trader to accept before re-forwarding.",
    },
    requirePaymentProof: {
      type: Boolean,
      default: true,
      description: "Whether digital payments require a screenshot upload.",
    },
    priceCeilingEnabled: {
      type: Boolean,
      default: true,
      description: "If true, traders with prices higher than the platform price are skipped.",
    },

    // --- Inventory & Stock ---
    defaultLowStockThreshold: {
      type: Number,
      default: 10,
      description: "Default threshold for low stock alerts if not specified per product.",
    },

    // --- Financials (Foundational for Startup) ---
    platformCommissionRate: {
      type: Number,
      default: 0,
      description: "Standard percentage taken by the platform from each sale.",
    },
  },
  {
    timestamps: true,
    capped: { size: 1024, max: 1 } // singleton
  },
);

const PlatformSetting = model("platformSetting", platformSettingSchema);
export default PlatformSetting;
