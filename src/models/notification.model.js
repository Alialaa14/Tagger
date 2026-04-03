import { model, Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
    },
    forAll: {
      type: Boolean,
      default: false,
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "user",
      },
    ],
  },
  { timestamps: true },
);

const Notification = model("notification", notificationSchema);
export default Notification;
