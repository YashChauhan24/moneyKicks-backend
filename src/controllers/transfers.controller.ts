import { Request, Response, NextFunction } from "express";
import { Transfer, Currency } from "../models/Transfer";
import { Jackpot } from "../models/Jackpot";
import { JackpotEntry } from "../models/JackpotEntry";

interface CreateTransferBody {
  fromWallet: string;
  toWallet: string;
  amount: number | string;
  currency: Currency;
  txHash?: string;
  network?: string;
  jackpotId?: string;
}

/**
 * Helper: basic validation for incoming transfer payload.
 */
const validateCreateTransferBody = (
  body: any
): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (!body.fromWallet || typeof body.fromWallet !== "string") {
    errors.push("fromWallet is required and must be a string.");
  }

  if (!body.toWallet || typeof body.toWallet !== "string") {
    errors.push("toWallet is required and must be a string.");
  }

  if (body.fromWallet && body.toWallet && body.fromWallet === body.toWallet) {
    errors.push("fromWallet and toWallet must be different.");
  }

  if (body.amount === undefined || body.amount === null) {
    errors.push("amount is required.");
  } else {
    const numericAmount = Number(body.amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      errors.push("amount must be a positive number.");
    }
  }

  if (!body.currency || (body.currency !== "USD" && body.currency !== "AVAX")) {
    errors.push("currency must be either 'USD' or 'AVAX'.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const createTransfer = async (
  req: Request<unknown, unknown, CreateTransferBody>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { valid, errors } = validateCreateTransferBody(req.body);

    if (!valid) {
      return res.status(400).json({
        message: "Invalid transfer payload.",
        errors,
      });
    }

    const { fromWallet, toWallet, amount, currency, txHash, network, jackpotId } =
      req.body;

    // If a jackpotId is provided, this transfer also represents
    // participation in that jackpot for the fromWallet address.
    if (jackpotId) {
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
        where: { jackpotId, walletAddress: fromWallet },
      });

      if (existingEntry) {
        return res.status(400).json({
          message: "This wallet has already entered this jackpot.",
        });
      }

      if (
        jackpot.currency !== "BOTH" &&
        currency !== jackpot.currency
      ) {
        return res.status(400).json({
          message: "Transfer currency is not allowed for this jackpot.",
        });
      }

      const numericAmount = Number(amount);
      const minAmount = Number(jackpot.minAmount);
      if (Number.isNaN(numericAmount) || numericAmount < minAmount) {
        return res.status(400).json({
          message: "Transfer amount does not meet the jackpot minimum.",
        });
      }
    }

    // All business logic here strictly records the transfer, it does NOT move funds.
    const transfer = await Transfer.create({
      fromWallet,
      toWallet,
      amount: String(amount),
      currency,
      txHash: txHash || null,
      network: network || null,
      jackpotId: jackpotId || null,
    });

    // If jackpotId was provided and validations passed, create a JackpotEntry
    // linking this transfer to the jackpot for the fromWallet address.
    if (jackpotId) {
      await JackpotEntry.create({
        jackpotId,
        walletAddress: fromWallet,
        transferId: transfer.id,
      });
    }

    return res.status(201).json({
      message: "Transfer recorded successfully.",
      data: transfer,
    });
  } catch (error) {
    // Forward unexpected errors to the global error handler.
    next(error);
  }
};

export const getTransferById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const transfer = await Transfer.findByPk(req.params.id);

    if (!transfer) {
      return res.status(404).json({ message: "Transfer not found." });
    }

    return res.json({
      data: transfer,
    });
  } catch (error) {
    next(error);
  }
};

export const getTransfersList = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);

    const transfers = await Transfer.findAll({
      limit: Math.min(limit, 100),
      offset,
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      data: transfers,
    });
  } catch (error) {
    next(error);
  }
};
