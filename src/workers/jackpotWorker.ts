import cron from "node-cron";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { formatEther, isAddress, parseEther } from "viem";

import { Jackpot } from "../models/Jackpot";
import { JackpotEntry } from "../models/JackpotEntry";
import { Transfer } from "../models/Transfer";

import {
  getEstimatedGasPriceWei,
  getWalletBalanceWei,
  sendWalletTransaction,
  waitForWalletTransactionReceipt,
  walletAddress,
} from "../utils/web3";
import { JackpotLog, JackpotLogType } from "../models/JackpotLog";
import {
  calculateJackpotPool,
  calculateWinnerDistribution,
  selectRandomWinners,
} from "../utils/jackpot.utils";

export const startJackpotWorker = () => {
  // cron.schedule("0 0 * * 5", async () => {
  cron.schedule("*/10 * * * *", async () => {
    console.log("[Jackpot Worker] Running weekly job...");

    try {
      await resolvePreviousJackpots();
      await createNewWeeklyJackpotIfNeeded();
    } catch (error) {
      console.error(error);
    }
  });
};

export const logJackpotEvent = async (
  jackpotId: string,
  type: JackpotLogType,
  message: string,
  metadata?: any,
) => {
  try {
    await JackpotLog.create({
      jackpotId,
      type,
      message,
      metadata,
    });
  } catch (error) {
    console.error("Failed to store jackpot log:", error);
  }
};

export const resolvePreviousJackpots = async () => {
  const now = new Date();
  console.log(`[Jackpot Worker] Starting resolution at ${now.toISOString()}`);

  const jackpots = await Jackpot.findAll({
    where: {
      isActive: true,
      endAt: { [Op.lte]: now },
    },
    order: [["endAt", "ASC"]],
    include: [
      {
        model: JackpotEntry,
        as: "entries",
        include: [
          {
            model: Transfer,
            as: "transfer",
          },
        ],
      },
    ],
  });

  console.log(
    `[Jackpot Worker] Found ${jackpots.length} active jackpots to resolve`,
  );

  if (!jackpots.length) {
    console.log("[Jackpot Worker] No jackpots to resolve");
    return;
  }

  for (const jackpot of jackpots) {
    console.log(
      `[Jackpot Worker] Processing jackpot: ID=${jackpot.id}, Name=${jackpot.name}`,
    );

    const entries = (jackpot as any).entries as JackpotEntry[];

    if (!entries || entries.length < 3) {
      console.log(
        `[Jackpot Worker] Jackpot ${jackpot.id} has insufficient participants (${entries?.length || 0}). Closing without winners.`,
      );
      await logJackpotEvent(jackpot.id, "error", "Not enough participants");

      await jackpot.update({ isActive: false });
      continue;
    }

    console.log(
      `[Jackpot Worker] Jackpot ${jackpot.id} has ${entries.length} participants.`,
    );

    let usdEntries = 0;
    let avaxEntries = 0;

    const walletAddresses: string[] = [];

    for (const entry of entries) {
      const transfer = (entry as any).transfer as Transfer;

      if (!transfer) {
        console.warn(
          `[Jackpot Worker] Entry ${entry.id} is missing an associated transfer! Skipping.`,
        );
        continue;
      }

      walletAddresses.push(entry.walletAddress);

      const amount = parseFloat(transfer.amount);

      if (transfer.currency === "USD") {
        usdEntries += amount;
      }

      if (transfer.currency === "AVAX") {
        avaxEntries += amount;
      }
    }

    console.log(
      `[Jackpot Worker] Totals for ${jackpot.id}: USD=${usdEntries}, AVAX=${avaxEntries}`,
    );

    const pool = await calculateJackpotPool(usdEntries, avaxEntries);
    console.log(
      `[Jackpot Worker] Pool calculated for ${jackpot.id}: Total USD Value = ${pool.totalPoolUSD}`,
    );

    await logJackpotEvent(
      jackpot.id,
      "pool_calculated",
      "Pool calculated",
      pool,
    );

    const distribution = calculateWinnerDistribution(pool.totalPoolUSD);
    console.log(
      `[Jackpot Worker] Distribution for ${jackpot.id}:`,
      JSON.stringify(distribution, null, 2),
    );

    await logJackpotEvent(
      jackpot.id,
      "distribution_calculated",
      "Distribution calculated",
      distribution,
    );

    const winners = selectRandomWinners(walletAddresses, distribution);
    const avaxRate = pool.breakdown.avaxRate;
    const payoutPlan = winners.map((winner) => {
      const prizeAVAX = winner.prizeUSD / avaxRate;
      return {
        ...winner,
        prizeAVAX,
        prizeAVAXStr: prizeAVAX.toFixed(18),
      };
    });

    console.log(
      `[Jackpot Worker] Winners selected for ${jackpot.id}:`,
      payoutPlan
        .map(
          (w) =>
            `${w.place}: ${w.walletAddress} (${w.prizeUSD} USD / ${w.prizeAVAXStr} AVAX)`,
        )
        .join(", "),
    );

    await logJackpotEvent(
      jackpot.id,
      "winner_selected",
      "Winners selected",
      payoutPlan,
    );

    const treasuryBalanceWei = await getWalletBalanceWei();
    const gasPriceWei = await getEstimatedGasPriceWei();
    const estimatedGasWei =
      gasPriceWei !== null && gasPriceWei > 0n
        ? gasPriceWei * 21_000n * BigInt(payoutPlan.length)
        : parseEther("0.01");

    const totalPayoutWei = payoutPlan.reduce(
      (sum, winner) => sum + parseEther(winner.prizeAVAXStr),
      0n,
    );
    const totalRequiredWei = totalPayoutWei + estimatedGasWei;

    if (treasuryBalanceWei < totalRequiredWei) {
      const message =
        "Treasury has insufficient AVAX balance for jackpot payout + gas";
      console.error(
        `[Jackpot Worker] ${message}. required=${formatEther(totalRequiredWei)} AVAX, balance=${formatEther(treasuryBalanceWei)} AVAX`,
      );
      await logJackpotEvent(jackpot.id, "error", message, {
        requiredAVAX: formatEther(totalRequiredWei),
        availableAVAX: formatEther(treasuryBalanceWei),
      });
      continue;
    }

    let successfulTransfers = 0;

    for (const winner of payoutPlan) {
      try {
        if (!isAddress(winner.walletAddress)) {
          throw new Error(`Invalid winner address: ${winner.walletAddress}`);
        }

        console.log(
          `[Jackpot Worker] Sending ${winner.prizeAVAXStr} AVAX (${winner.prizeUSD} USD) to ${winner.walletAddress} (Place ${winner.place})...`,
        );
        const amountWei = parseEther(winner.prizeAVAXStr);

        const txHash = await sendWalletTransaction({
          to: winner.walletAddress,
          value: amountWei,
        });

        console.log(
          `[Jackpot Worker] Transaction sent for ${winner.walletAddress}: ${txHash}. Waiting for receipt...`,
        );

        const receipt = await waitForWalletTransactionReceipt(txHash);

        if (!receipt) {
          throw new Error("Transaction failed (no receipt)");
        }

        console.log(
          `[Jackpot Worker] Transaction confirmed for ${winner.walletAddress}: ${receipt.transactionHash}`,
        );

        await Transfer.create({
          id: uuidv4(),
          amount: winner.prizeAVAX.toFixed(8),
          currency: "AVAX",
          fromWallet: walletAddress,
          toWallet: winner.walletAddress,
          txHash: receipt.transactionHash,
          jackpotId: jackpot.id,
          network: "avalanche-c-chain-testnet",
        });

        await logJackpotEvent(jackpot.id, "transfer_sent", "Prize sent", {
          wallet: winner.walletAddress,
          place: winner.place,
          amountUSD: winner.prizeUSD,
          amountAVAX: winner.prizeAVAX.toFixed(8),
          txHash: receipt.transactionHash,
        });

        successfulTransfers += 1;
      } catch (error) {
        console.error(
          `[Jackpot Worker] FAILED to send prize to ${winner.walletAddress}:`,
          error,
        );
        await logJackpotEvent(jackpot.id, "error", "Transfer failed", {
          wallet: winner.walletAddress,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (successfulTransfers === payoutPlan.length) {
      await jackpot.update({ isActive: false });
      console.log(
        `[Jackpot Worker] Jackpot ${jackpot.id} marked as inactive (resolved).`,
      );

      await logJackpotEvent(
        jackpot.id,
        "resolved",
        "Jackpot resolved successfully",
      );
    } else if (successfulTransfers === 0) {
      console.error(
        `[Jackpot Worker] Jackpot ${jackpot.id} payout failed for all winners. Keeping jackpot active for retry after treasury refill.`,
      );
      await logJackpotEvent(
        jackpot.id,
        "error",
        "No payouts succeeded; jackpot remains active",
      );
    } else {
      await jackpot.update({ isActive: false });
      console.error(
        `[Jackpot Worker] Jackpot ${jackpot.id} had partial payout (${successfulTransfers}/${payoutPlan.length}). Marked inactive to prevent duplicate payouts.`,
      );
      await logJackpotEvent(
        jackpot.id,
        "error",
        "Partial payout failure; jackpot marked inactive for manual review",
        {
          successfulTransfers,
          expectedTransfers: payoutPlan.length,
        },
      );
    }
  }
  console.log(`[Jackpot Worker] Resolution process completed.`);
};

export const createNewWeeklyJackpot = async () => {
  const startAt = new Date();
  console.log(
    `[Jackpot Worker] Creating new weekly jackpot starting ${startAt.toISOString()}`,
  );

  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 7);
  endAt.setUTCHours(0, 0, 0, 0);

  const jackpotId = uuidv4();
  const name = `Weekly Jackpot ${startAt.toISOString().split("T")[0]}`;

  const jackpot = await Jackpot.create({
    id: jackpotId,
    name,
    startAt,
    endAt,
    minAmount: "0.10000000",
    currency: "AVAX",
    isActive: true,
  });

  console.log(
    `[Jackpot Worker] New weekly jackpot created: ID=${jackpot.id}, Name="${jackpot.name}", Ends=${jackpot.endAt.toISOString()}`,
  );

  await logJackpotEvent(jackpot.id, "created", "Weekly jackpot created");
  return jackpot;
};

export const createNewWeeklyJackpotIfNeeded = async () => {
  const existingActiveJackpot = await Jackpot.findOne({
    where: {
      isActive: true,
    },
    order: [["createdAt", "DESC"]],
  });

  if (existingActiveJackpot) {
    console.log(
      `[Jackpot Worker] Skipping creation: active jackpot already exists (ID=${existingActiveJackpot.id}, Ends=${existingActiveJackpot.endAt.toISOString()})`,
    );
    return existingActiveJackpot;
  }

  return createNewWeeklyJackpot();
};
