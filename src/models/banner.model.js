import { model, Schema } from "mongoose";
const bannerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    imageUrl: {
      url: { type: String, required: true },
      public_id: { type: String },
    }, // stored path or external URL
    buttonText: { type: String },
    buttonLink: { type: String },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Banner = model("Banner", bannerSchema);
export default Banner;
