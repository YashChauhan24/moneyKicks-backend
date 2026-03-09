import cron from "node-cron";
import { Op } from "sequelize";
import { ethers } from "ethers";
import { v4 as uuidv4 } from "uuid";

import { Jackpot } from "../models/Jackpot";
import { JackpotEntry } from "../models/JackpotEntry";
import { Transfer } from "../models/Transfer";

import { wallet } from "../utils/web3";
import { JackpotLog, JackpotLogType } from "../models/JackpotLog";
import {
  calculateJackpotPool,
  calculateWinnerDistribution,
  selectRandomWinners,
} from "../utils/jackpot.utils";

export const startJackpotWorker = () => {
  cron.schedule("0 0 * * 5", async () => {
    console.log("[Jackpot Worker] Running weekly job...");

    try {
      await resolvePreviousJackpots();
      await createNewWeeklyJackpot();
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
    console.log(
      `[Jackpot Worker] Winners selected for ${jackpot.id}:`,
      winners
        .map((w) => `${w.place}: ${w.walletAddress} (${w.prizeUSD} USD)`)
        .join(", "),
    );

    await logJackpotEvent(
      jackpot.id,
      "winner_selected",
      "Winners selected",
      winners,
    );

    for (const winner of winners) {
      try {
        console.log(
          `[Jackpot Worker] Sending ${winner.prizeUSD} USD to ${winner.walletAddress} (Place ${winner.place})...`,
        );
        const amountWei = ethers.parseEther(winner.prizeUSD.toString());

        const tx = await wallet.sendTransaction({
          to: winner.walletAddress,
          value: amountWei,
        });

        console.log(
          `[Jackpot Worker] Transaction sent for ${winner.walletAddress}: ${tx.hash}. Waiting for receipt...`,
        );

        const receipt = await tx.wait();

        if (!receipt) {
          throw new Error("Transaction failed (no receipt)");
        }

        console.log(
          `[Jackpot Worker] Transaction confirmed for ${winner.walletAddress}: ${receipt.hash}`,
        );

        await Transfer.create({
          id: uuidv4(),
          amount: winner.prizeUSD.toString(),
          currency: "USD",
          fromWallet: wallet.address,
          toWallet: winner.walletAddress,
          txHash: receipt.hash,
          jackpotId: jackpot.id,
          network: "avalanche-c-chain-testnet",
        });

        await logJackpotEvent(jackpot.id, "transfer_sent", "Prize sent", {
          wallet: winner.walletAddress,
          place: winner.place,
          amount: winner.prizeUSD,
          txHash: receipt.hash,
        });
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

    await jackpot.update({ isActive: false });
    console.log(
      `[Jackpot Worker] Jackpot ${jackpot.id} marked as inactive (resolved).`,
    );

    await logJackpotEvent(
      jackpot.id,
      "resolved",
      "Jackpot resolved successfully",
    );
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
