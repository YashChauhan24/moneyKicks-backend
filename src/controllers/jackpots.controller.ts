import { Request, Response, NextFunction } from "express";
import { Op } from "sequelize";
import { Jackpot } from "../models/Jackpot";
import { JackpotEntry } from "../models/JackpotEntry";
import { Transfer } from "../models/Transfer";
import {
  calculateJackpotPool,
  calculateWinnerDistribution,
  selectRandomWinners,
} from "../utils/jackpot.utils";
import {
  resolvePreviousJackpots,
  createNewWeeklyJackpot,
} from "../workers/jackpotWorker";

interface CreateJackpotBody {
  name: string;
  startAt: string;
  endAt: string;
  minAmount: string | number;
  // USD-only, AVAX-only, or BOTH
  currency: "USD" | "AVAX" | "BOTH";
  isActive?: boolean;
}

interface CreateEntryBody {
  walletAddress: string;
  transferId: string;
}

export const createJackpot = async (
  req: Request<unknown, unknown, CreateJackpotBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      name,
      startAt,
      endAt,
      minAmount,
      currency,
      isActive = true,
    } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "name is required." });
    }

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res
        .status(400)
        .json({ message: "startAt and endAt must be valid ISO dates." });
    }

    if (end <= start) {
      return res
        .status(400)
        .json({ message: "endAt must be greater than startAt." });
    }

    const amountNum = Number(minAmount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      return res
        .status(400)
        .json({ message: "minAmount must be a positive number." });
    }

    if (!["USD", "AVAX", "BOTH"].includes(currency)) {
      return res.status(400).json({
        message: "currency must be one of 'USD', 'AVAX', or 'BOTH'.",
      });
    }

    const jackpot = await Jackpot.create({
      name,
      startAt: start,
      endAt: end,
      minAmount: String(minAmount),
      currency,
      isActive,
    });

    return res.status(201).json({
      message: "Jackpot created successfully.",
      data: jackpot,
    });
  } catch (error) {
    next(error);
  }
};

export const listJackpots = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { isActive, currency } = req.query;
    const where: any = {};

    if (typeof isActive === "string") {
      where.isActive = isActive === "true";
    }

    if (currency === "USD" || currency === "AVAX" || currency === "BOTH") {
      where.currency = currency;
    }

    const jackpots = await Jackpot.findAll({
      where,
      order: [["startAt", "DESC"]],
    });

    return res.json({ data: jackpots });
  } catch (error) {
    next(error);
  }
};

export const createJackpotEntry = async (
  req: Request<{ jackpotId: string }, unknown, CreateEntryBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jackpotId } = req.params;
    const { walletAddress, transferId } = req.body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return res
        .status(400)
        .json({ message: "walletAddress is required and must be a string." });
    }

    if (!transferId || typeof transferId !== "string") {
      return res
        .status(400)
        .json({ message: "transferId is required and must be a string." });
    }

    const jackpot = await Jackpot.findByPk(jackpotId);
    if (!jackpot) {
      return res.status(404).json({ message: "Jackpot not found." });
    }

    const now = new Date();
    if (jackpot.isActive && (now < jackpot.startAt || now > jackpot.endAt)) {
      return res.status(400).json({
        message: "Jackpot is not currently within its active time window.",
      });
    }

    const existingEntry = await JackpotEntry.findOne({
      where: { jackpotId, walletAddress },
    });

    if (existingEntry) {
      return res.status(400).json({
        message: "This wallet has already entered this jackpot.",
      });
    }

    const transfer = await Transfer.findByPk(transferId);
    if (!transfer) {
      return res.status(404).json({ message: "Transfer not found." });
    }

    if (
      transfer.fromWallet !== walletAddress &&
      transfer.toWallet !== walletAddress
    ) {
      return res.status(400).json({
        message: "The transfer does not belong to the provided wallet address.",
      });
    }

    if (jackpot.currency !== "BOTH" && transfer.currency !== jackpot.currency) {
      return res.status(400).json({
        message: "Transfer currency is not allowed for this jackpot.",
      });
    }

    const transferAmount = Number(transfer.amount);
    const minAmount = Number(jackpot.minAmount);
    if (Number.isNaN(transferAmount) || transferAmount < minAmount) {
      return res.status(400).json({
        message: "Transfer amount does not meet the jackpot minimum.",
      });
    }

    if (
      !transfer.createdAt ||
      transfer.createdAt < jackpot.startAt ||
      transfer.createdAt > jackpot.endAt
    ) {
      return res.status(400).json({
        message:
          "Transfer is not within the jackpot's start and end date window.",
      });
    }

    const entry = await JackpotEntry.create({
      jackpotId,
      walletAddress,
      transferId,
    });

    return res.status(201).json({
      message: "Jackpot entry created successfully.",
      data: entry,
    });
  } catch (error) {
    next(error);
  }
};

export const listJackpotEntries = async (
  req: Request<{ jackpotId: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jackpotId } = req.params;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);

    const entries = await JackpotEntry.findAll({
      where: { jackpotId },
      limit: Math.min(limit, 200),
      offset,
      order: [["createdAt", "DESC"]],
    });

    return res.json({ data: entries });
  } catch (error) {
    next(error);
  }
};

export const checkJackpotEligibility = async (
  req: Request<{ jackpotId: string }, unknown, CreateEntryBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jackpotId } = req.params;
    const { walletAddress, transferId } = req.body;

    const jackpot = await Jackpot.findByPk(jackpotId);
    if (!jackpot) {
      return res
        .status(404)
        .json({ eligible: false, reasons: ["Jackpot not found."] });
    }

    const reasons: string[] = [];

    if (!walletAddress || typeof walletAddress !== "string") {
      reasons.push("walletAddress is required and must be a string.");
    }
    if (!transferId || typeof transferId !== "string") {
      reasons.push("transferId is required and must be a string.");
    }
    if (reasons.length) {
      return res.status(200).json({ eligible: false, reasons });
    }

    const existingEntry = await JackpotEntry.findOne({
      where: { jackpotId, walletAddress },
    });
    if (existingEntry) {
      reasons.push("Wallet has already entered this jackpot.");
    }

    const transfer = await Transfer.findByPk(transferId);
    if (!transfer) {
      reasons.push("Transfer not found.");
    } else {
      if (
        transfer.fromWallet !== walletAddress &&
        transfer.toWallet !== walletAddress
      ) {
        reasons.push(
          "The transfer does not belong to the provided wallet address.",
        );
      }

      if (
        jackpot.currency !== "BOTH" &&
        transfer.currency !== jackpot.currency
      ) {
        reasons.push("Transfer currency is not allowed for this jackpot.");
      }

      const transferAmount = Number(transfer.amount);
      const minAmount = Number(jackpot.minAmount);
      if (Number.isNaN(transferAmount) || transferAmount < minAmount) {
        reasons.push("Transfer amount does not meet the jackpot minimum.");
      }

      if (
        !transfer.createdAt ||
        transfer.createdAt < jackpot.startAt ||
        transfer.createdAt > jackpot.endAt
      ) {
        reasons.push(
          "Transfer is not within the jackpot's start and end date window.",
        );
      }
    }

    const eligible = reasons.length === 0;
    return res.status(200).json({ eligible, reasons });
  } catch (error) {
    next(error);
  }
};

export const getJackpotParticipantByWallet = async (
  req: Request<{ jackpotId: string; walletAddress: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jackpotId, walletAddress } = req.params;

    const entry = await JackpotEntry.findOne({
      where: { jackpotId, walletAddress },
      include: [
        {
          model: Transfer,
          as: "transfer",
        },
      ],
    });

    if (!entry) {
      return res.status(404).json({
        message: "No participation found for this wallet in the jackpot.",
      });
    }

    return res.json({
      data: entry,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get the total pool for a jackpot based on all entries
 * Returns the total pool in USD with breakdown of USD and AVAX entries
 * Also includes the prize distribution amounts for the three winners
 */
export const getJackpotPool = async (
  req: Request<{ jackpotId: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jackpotId } = req.params;

    const jackpot = await Jackpot.findByPk(jackpotId);
    if (!jackpot) {
      return res.status(404).json({ message: "Jackpot not found." });
    }

    // Get all entries for this jackpot with their associated transfers
    const entries = await JackpotEntry.findAll({
      where: { jackpotId },
      include: [
        {
          model: Transfer,
          as: "transfer",
          attributes: ["id", "amount", "currency"],
        },
      ],
    });

    let totalUSD = 0;
    let totalAVAX = 0;

    entries.forEach((entry: any) => {
      const transfer = entry.transfer;
      if (transfer) {
        const amount = Number(transfer.amount);
        if (transfer.currency === "USD") {
          totalUSD += amount;
        } else if (transfer.currency === "AVAX") {
          totalAVAX += amount;
        }
      }
    });

    const poolInfo = await calculateJackpotPool(totalUSD, totalAVAX);
    const distribution = calculateWinnerDistribution(poolInfo.totalPoolUSD);

    return res.json({
      data: {
        jackpotId,
        jackpotName: jackpot.name,
        participantCount: entries.length,
        totalPoolUSD: poolInfo.totalPoolUSD,
        breakdown: poolInfo.breakdown,
        prizeDistribution: {
          totalPool: distribution.totalPool,
          platformFee: distribution.platformFee,
          platformFeePercentage: distribution.platformFeePercentage,
          remainingAfterFee: distribution.remainingAfterFee,
          winners: [
            {
              place: 1,
              percentage: 47.5,
              amountUSD: distribution.winners[0]?.amount ?? 0,
            },
            {
              place: 2,
              percentage: 28.5,
              amountUSD: distribution.winners[1]?.amount ?? 0,
            },
            {
              place: 3,
              percentage: 19,
              amountUSD: distribution.winners[2]?.amount ?? 0,
            },
          ],
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Select 3 random winners from a jackpot and calculate prize distribution
 * Returns the winners with their prize amounts based on the formula:
 * Platform fee: 5%, Distribution: 1st=47.5%, 2nd=28.5%, 3rd=19%
 */
export const selectJackpotWinners = async (
  req: Request<{ jackpotId: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jackpotId } = req.params;

    const jackpot = await Jackpot.findByPk(jackpotId);
    if (!jackpot) {
      return res.status(404).json({ message: "Jackpot not found." });
    }

    // Get all entries for this jackpot with their associated transfers
    const entries = await JackpotEntry.findAll({
      where: { jackpotId },
      include: [
        {
          model: Transfer,
          as: "transfer",
          attributes: ["id", "amount", "currency"],
        },
      ],
    });

    if (entries.length < 3) {
      return res.status(400).json({
        message: "Need at least 3 participants to select winners.",
        participantCount: entries.length,
      });
    }

    // Calculate pool amounts
    let totalUSD = 0;
    let totalAVAX = 0;

    entries.forEach((entry: any) => {
      const transfer = entry.transfer;
      if (transfer) {
        const amount = Number(transfer.amount);
        if (transfer.currency === "USD") {
          totalUSD += amount;
        } else if (transfer.currency === "AVAX") {
          totalAVAX += amount;
        }
      }
    });

    const poolInfo = await calculateJackpotPool(totalUSD, totalAVAX);
    const distribution = calculateWinnerDistribution(poolInfo.totalPoolUSD);

    // Get unique wallet addresses (remove duplicates if any)
    const walletAddresses = [...new Set(entries.map((e) => e.walletAddress))];

    // Select 3 random winners
    const selectedWinners = selectRandomWinners(walletAddresses, distribution);

    return res.json({
      data: {
        jackpotId,
        jackpotName: jackpot.name,
        participantCount: entries.length,
        poolSummary: {
          totalPoolUSD: poolInfo.totalPoolUSD,
          breakdown: poolInfo.breakdown,
        },
        prizeDistribution: {
          totalPool: distribution.totalPool,
          platformFee: distribution.platformFee,
          remainingAfterFee: distribution.remainingAfterFee,
          prizePercentages: {
            first: 47.5,
            second: 28.5,
            third: 19,
          },
        },
        winners: selectedWinners,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger the jackpot resolution worker
 */
export const triggerJackpotResolve = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    console.log("[Admin API] Manually triggering jackpot resolution...");
    // We don't await it if we want it to run in background,
    // but for testing/manual trigger, it's better to await or at least start it.
    // Awaiting here so the requester gets a confirmation when it's DONE or if it started.
    await resolvePreviousJackpots();

    return res.json({
      message:
        "Jackpot resolution process completed. Check server logs for details.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger the creation of a new weekly jackpot
 */
export const triggerJackpotCreate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    console.log("[Admin API] Manually triggering weekly jackpot creation...");
    const jackpot = await createNewWeeklyJackpot();

    return res.json({
      message: "Weekly jackpot created successfully.",
      data: jackpot,
    });
  } catch (error) {
    next(error);
  }
};
