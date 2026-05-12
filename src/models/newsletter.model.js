import { Schema, model } from "mongoose";

const newsletterSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: [true, "User reference is required for newsletter subscription"],
      unique: true,
    },
  },
  { timestamps: true }
);

const Newsletter = model("newsletter", newsletterSchema);
export default Newsletter;
