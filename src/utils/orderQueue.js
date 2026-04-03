import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import { onlineUsers } from "../../server.js";

// ─── Redis Connection ────────────────────────────────────────────────────────
const redisConnection = new IORedis({
  maxRetriesPerRequest: null, // Required by BullMQ
});

// ─── Queue ───────────────────────────────────────────────────────────────────
export const orderForwardQueue = new Queue("orderForward", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1, // Each job runs once; re-queuing is done manually
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for inspection
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch the next available trader to forward the order to.
 * Excludes already-tried traders and the shop owner.
 *
 * Strategy: pick the trader with the highest `rank` that hasn't been tried yet.
 * Swap out this query for any business logic you prefer.
 */
async function getNextTrader(excludeIds = []) {
  return User.findOne({
    role: "trader",
    _id: { $nin: excludeIds },
    isOnline: true,
  }).sort({ rank: -1 });
}

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

// ─── Enqueue helpers (called from your controller) ──────────────────────────

const TIMEOUT_MS = 5 * 1000; // 5 Seconds — adjust as needed

/**
 * Add a forwarding-check job for a freshly sent order.
 *
 * @param {string} orderId
 * @param {string} traderId  — the trader the order was just sent to
 * @param {string[]} triedTraderIds — accumulating list of traders already tried
 */
export async function enqueueOrderCheck(
  orderId,
  traderId,
  triedTraderIds = [],
) {
  await orderForwardQueue.add(
    "checkAndForward",
    { orderId, traderId, triedTraderIds },
    {
      delay: TIMEOUT_MS,
      jobId: `order-${orderId}-trader-${traderId}`, // Idempotent per attempt
    },
  );
  console.log(
    `[Queue] Scheduled check for order ${orderId} → trader ${traderId} in ${TIMEOUT_MS / 1000}s`,
  );
}

/**
 * Cancel any pending check job for this order+trader combination.
 * Call this when the trader accepts or rejects in time.
 */
export async function cancelOrderCheck(orderId, traderId) {
  const jobId = `order-${orderId}-trader-${traderId}`;
  const job = await orderForwardQueue.getJob(jobId);
  if (job) {
    await job.remove();
    console.log(`[Queue] Cancelled check job ${jobId}`);
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────

/**
 * createOrderForwardWorker — call once at app startup, passing your `io` instance.
 */
export function createOrderForwardWorker(io) {
  const worker = new Worker(
    "orderForward",
    async (job) => {
      const { orderId, traderId, triedTraderIds } = job.data;

      console.log(
        `[Worker] Checking order ${orderId} — was sent to trader ${traderId}`,
      );

      // 1. Fetch the current order state
      const order = await Order.findById(orderId);

      if (!order) {
        console.log(`[Worker] Order ${orderId} not found — skipping.`);
        return;
      }

      // 2. If the trader already responded (accepted/rejected), nothing to do
      if (order.status !== "pending") {
        console.log(
          `[Worker] Order ${orderId} already has status "${order.status}" — no forwarding needed.`,
        );
        return;
      }

      // 3. Build the updated tried list (add current trader if not already there)
      const updatedTriedIds = Array.from(
        new Set([...triedTraderIds, traderId.toString()]),
      );

      console.log(updatedTriedIds);

      // 4. Find the next trader
      const nextTrader = await getNextTrader(updatedTriedIds);

      if (!nextTrader) {
        console.warn(
          `[Worker] No available traders left for order ${orderId}. Marking as unassigned.`,
        );
        await Order.findByIdAndUpdate(orderId, {
          status: "pending",
          traderId: null,
        });
        io.to("admin").emit("orderUnassigned", { orderId });
        const socketId = onlineUsers.get(traderId.toString());
        if (socketId) {
          io.to(socketId).emit("orderUnassigned", { orderId });
        }
        return;
      }

      // 5. Assign the next trader
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { traderId: nextTrader._id, status: "pending" },
        { new: true },
      )
        .populate(
          "shopId",
          "shopName phoneNumber address city governorate username",
        )
        .populate("traderId", "name phoneNumber username shopName")
        .populate("products.productId", "name price image");

      if (!updatedOrder) {
        console.error(`[Worker] Failed to update order ${orderId}.`);
        return;
      }

      console.log(
        `[Worker] Order ${orderId} forwarded to next trader ${nextTrader._id}`,
      );

      // 6. Notify admin + new trader via socket
      emitOrderToTrader(io, nextTrader._id, updatedOrder);

      // 7. Schedule the next timeout check for the new trader
      await enqueueOrderCheck(
        orderId,
        nextTrader._id.toString(),
        updatedTriedIds,
      );
    },
    {
      connection: redisConnection,
      concurrency: 10, // Process up to 10 jobs simultaneously
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed.`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
