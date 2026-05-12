import { Queue, Worker } from "bullmq";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import { onlineUsers } from "../../server.js";
import { findBestTrader } from "./orderUtils.js";
import { getPlatformSettings } from "./settingsHelper.js";
import redis, { checkIsMockMode } from "./redis.js";
import { ENV } from "./ENV.js";

// ─── Queue ───────────────────────────────────────────────────────────────────
export const orderForwardQueue = !checkIsMockMode()
  ? new Queue("orderForward", {
    connection: redis,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: false,
    },
  })
  : null;

/**
 * Emit the order to a trader's socket (if online) and to the admin room.
 */
function emitOrderToTrader(io, traderId, populatedOrder) {
  io.to("admin").emit("sendOrder", { order: populatedOrder });

  const socketId = onlineUsers.get(traderId.toString());
  if (socketId) {
    io.to(socketId).emit("sendOrder", { order: populatedOrder });
  }
}

// ─── Enqueue helpers ─────────────────────────────────────────────────────────

export async function enqueueOrderCheck(orderId, traderId) {
  if (checkIsMockMode() || !orderForwardQueue) {
    console.warn(`[Queue] Mock Mode Active. Skipping delayed check for order ${orderId}. Automatic re-forwarding will not work without Redis.`);
    return;
  }

  const settings = await getPlatformSettings();
  const timeoutMs = (settings.orderTimeoutMinutes) * 60 * 1000;

  try {
    await orderForwardQueue.add(
      "checkAndForward",
      { orderId, traderId },
      {
        delay: timeoutMs,
        jobId: `order-${orderId}-trader-${traderId}`,
      },
    );
  } catch (error) {
    console.error("[Queue] Failed to add job to Redis:", error.message);
  }
}

export async function cancelOrderCheck(orderId, traderId) {
  if (checkIsMockMode() || !orderForwardQueue) return;

  const jobId = `order-${orderId}-trader-${traderId}`;
  try {
    const job = await orderForwardQueue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  } catch (error) {
    // Ignore cleanup errors in mock mode
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export function createOrderForwardWorker(io) {
  if (checkIsMockMode()) {
    console.warn("[Worker] Mock Mode Active. Automatic order forwarding worker is disabled.");
    return null;
  }

  const worker = new Worker(
    "orderForward",
    async (job) => {
      const { orderId, traderId } = job.data;
      const order = await Order.findById(orderId);

      if (!order || order.status !== "pending") return;

      // Ensure the order hasn't been assigned to someone else in the meantime
      if (order.traderId?.toString() !== traderId.toString()) {
        console.info(`[Worker] Order ${orderId} is no longer assigned to trader ${traderId}. Stopping.`);
        return;
      }

      // Check if automatic forwarding is enabled globally
      const settings = await getPlatformSettings();
      if (!settings.autoForward) {
        console.info(`[Worker] Auto forwarding is disabled globally. Stopping re-forwarding for order ${orderId}.`);
        return;
      }

      console.info(`[Worker] Order ${orderId} timed out on trader ${traderId}. Searching for next available trader...`);

      // 1. Update tried list in DB
      const updatedOrderInDb = await Order.findByIdAndUpdate(orderId, {
        $addToSet: { triedTraderIds: traderId.toString() }
      }, { new: true });

      // 2. Use Smart selection logic to find the next trader
      const eligibleTraders = await findBestTrader(
        updatedOrderInDb.products,
        updatedOrderInDb.triedTraderIds,
        updatedOrderInDb.totalPrice
      );

      if (!eligibleTraders || eligibleTraders.length === 0) {
        console.warn(`[Worker] No eligible traders left for order ${orderId}. Marking as unassigned.`);
        await Order.findByIdAndUpdate(orderId, { traderId: null });
        io.to("admin").emit("orderUnassigned", { orderId });
        io.to("admin").emit("error", {
          message: "لا يوجد تجار متاحون لتنفيذ هذا الطلب حالياً",
          orderId: orderId
        });
        return;
      }

      const nextTraderResult = eligibleTraders[0];
      const { trader: nextTrader, totalTraderPrice, products: updatedProducts } = nextTraderResult;

      // 3. Assign the next trader and update prices
      const finalUpdatedOrder = await Order.findOneAndUpdate(
        { _id: orderId, status: "pending" },
        {
          traderId: nextTrader._id,
          status: "pending",
          totalTraderPrice,
          products: updatedProducts,
          $push: {
            history: { phase: "auto forward", doneBy: null },
            triedTraderIds: nextTrader._id
          }
        },
        { new: true },
      )
        .populate("shopId", "shopName phoneNumber address city governorate username")
        .populate("traderId", "name phoneNumber username shopName")
        .populate("products.productId", "name price image");

      if (!finalUpdatedOrder) return;

      console.log(`[Worker] Order ${orderId} forwarded to next trader ${nextTrader._id} | Price: ${totalTraderPrice}`);

      const formattedOrder = finalUpdatedOrder.toObject();
      formattedOrder.history = await finalUpdatedOrder.getFormattedHistory();

      emitOrderToTrader(io, nextTrader._id, formattedOrder);

      await enqueueOrderCheck(orderId, nextTrader._id.toString());
    },
    {
      connection: redis,
      concurrency: 10,
    },
  );

  return worker;
}
