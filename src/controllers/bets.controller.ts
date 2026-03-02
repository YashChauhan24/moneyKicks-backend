import { Request, Response, NextFunction } from "express";
import { Op, Sequelize, WhereOptions } from "sequelize";
import { AuthenticatedRequest } from "../middleware/auth";
import { Bet, BetAttributes, BetStatus } from "../models/Bet";
import { BetPrediction, BetSide } from "../models/BetPrediction";

interface CreateBetBody {
  title: string;
  description: string;
  competitorAName: string;
  competitorBName: string;
  endCondition: string;
  stakeAmount: number | string;
  currency: string;
  endAt: string;
  status?: BetStatus;
  startAt?: string;
}

interface CreatePredictionBody {
  side: BetSide;
  amount: number | string;
}

const parsePositiveAmount = (value: unknown): number | null => {
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
};

export const createBet = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const {
      title,
      description,
      competitorAName,
      competitorBName,
      endCondition,
      stakeAmount,
      currency,
      endAt,
      status,
      startAt,
    } = req.body as CreateBetBody;

    if (!title || typeof title !== "string") {
      return res.status(400).json({ message: "title is required." });
    }
    if (!description || typeof description !== "string") {
      return res.status(400).json({ message: "description is required." });
    }
    if (!competitorAName || typeof competitorAName !== "string") {
      return res.status(400).json({ message: "competitorAName is required." });
    }
    if (!competitorBName || typeof competitorBName !== "string") {
      return res.status(400).json({ message: "competitorBName is required." });
    }
    if (!endCondition || typeof endCondition !== "string") {
      return res.status(400).json({ message: "endCondition is required." });
    }

    const parsedStake = parsePositiveAmount(stakeAmount);
    if (parsedStake === null) {
      return res.status(400).json({
        message: "stakeAmount must be a positive number.",
      });
    }

    if (!currency || typeof currency !== "string") {
      return res.status(400).json({ message: "currency is required." });
    }

    const end = new Date(endAt);
    if (!endAt || Number.isNaN(end.getTime())) {
      return res
        .status(400)
        .json({ message: "endAt must be a valid ISO date." });
    }

    const start =
      startAt && typeof startAt === "string" ? new Date(startAt) : new Date();

    if (Number.isNaN(start.getTime())) {
      return res
        .status(400)
        .json({ message: "startAt must be a valid ISO date if provided." });
    }

    if (end <= start) {
      return res
        .status(400)
        .json({ message: "endAt must be greater than startAt." });
    }

    let resolvedStatus: BetStatus = "live";
    if (status === "pending" || status === "live" || status === "settled") {
      resolvedStatus = status;
    } else if (start > new Date()) {
      resolvedStatus = "pending";
    }

    const bet = await Bet.create({
      title,
      description,
      competitorAName,
      competitorBName,
      endCondition,
      stakeAmount: String(parsedStake),
      currency,
      status: resolvedStatus,
      startAt: start,
      endAt: end,
      createdByUserId: req.user.id,
    });

    return res.status(201).json({
      message: "Bet created successfully.",
      data: bet,
    });
  } catch (error) {
    next(error);
  }
};

export const listBets = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status, search } = req.query;
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);

    const filters: WhereOptions<BetAttributes>[] = [];

    /**
     * ✅ Status filter
     */
    const allowedStatuses: BetStatus[] = [
      "pending",
      "live",
      "settled",
      "closed",
    ];

    if (
      typeof status === "string" &&
      allowedStatuses.includes(status as BetStatus)
    ) {
      filters.push({
        status: status as BetStatus,
      });
    }

    /**
     * ✅ Search filter
     */
    if (typeof search === "string" && search.trim().length > 0) {
      const normalizedSearch = search.trim();

      filters.push({
        [Op.or]: [
          { title: { [Op.like]: `%${normalizedSearch}%` } },
          { competitorAName: { [Op.like]: `%${normalizedSearch}%` } },
          { competitorBName: { [Op.like]: `%${normalizedSearch}%` } },
        ],
      });
    }

    /**
     * ✅ Final WHERE
     */
    const where: WhereOptions<BetAttributes> =
      filters.length > 0 ? { [Op.and]: filters } : {};

    const bets = await Bet.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const betIds = bets.map((b) => b.id);
    let statsByBetId: Record<string, any> = {};

    if (betIds.length > 0) {
      const rows = await BetPrediction.findAll({
        attributes: [
          "betId",
          [
            Sequelize.fn(
              "COUNT",
              Sequelize.fn("DISTINCT", Sequelize.col("userId")),
            ),
            "predictorCount",
          ],
          [Sequelize.fn("SUM", Sequelize.col("amount")), "totalPool"],
          [
            Sequelize.fn(
              "SUM",
              Sequelize.literal("CASE WHEN side = 'A' THEN amount ELSE 0 END"),
            ),
            "totalOnA",
          ],
          [
            Sequelize.fn(
              "SUM",
              Sequelize.literal("CASE WHEN side = 'B' THEN amount ELSE 0 END"),
            ),
            "totalOnB",
          ],
        ],
        where: { betId: { [Op.in]: betIds } },
        group: ["betId"],
        raw: true,
      });

      statsByBetId = rows.reduce((acc: any, row: any) => {
        acc[row.betId] = {
          predictorCount: Number(row.predictorCount ?? 0),
          totalPool: row.totalPool ?? "0",
          totalOnA: row.totalOnA ?? "0",
          totalOnB: row.totalOnB ?? "0",
        };
        return acc;
      }, {});
    }

    const data = bets.map((bet) => {
      const stats = statsByBetId[bet.id] ?? {
        predictorCount: 0,
        totalPool: "0",
        totalOnA: "0",
        totalOnB: "0",
      };
      return {
        ...bet.toJSON(),
        stats,
      };
    });

    return res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const getBetById = async (
  req: Request<{ betId: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { betId } = req.params;

    const bet = await Bet.findByPk(betId);
    if (!bet) {
      return res.status(404).json({ message: "Bet not found." });
    }

    const row = await BetPrediction.findOne({
      attributes: [
        "betId",
        [
          Sequelize.fn(
            "COUNT",
            Sequelize.fn("DISTINCT", Sequelize.col("userId")),
          ),
          "predictorCount",
        ],
        [Sequelize.fn("SUM", Sequelize.col("amount")), "totalPool"],
        [
          Sequelize.fn(
            "SUM",
            Sequelize.literal("CASE WHEN side = 'A' THEN amount ELSE 0 END"),
          ),
          "totalOnA",
        ],
        [
          Sequelize.fn(
            "SUM",
            Sequelize.literal("CASE WHEN side = 'B' THEN amount ELSE 0 END"),
          ),
          "totalOnB",
        ],
      ],
      where: { betId },
      group: ["betId"],
      raw: true,
    });

    const stats = row
      ? {
          predictorCount: Number((row as any).predictorCount ?? 0),
          totalPool: (row as any).totalPool ?? "0",
          totalOnA: (row as any).totalOnA ?? "0",
          totalOnB: (row as any).totalOnB ?? "0",
        }
      : {
          predictorCount: 0,
          totalPool: "0",
          totalOnA: "0",
          totalOnB: "0",
        };

    return res.json({
      data: {
        ...bet.toJSON(),
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createBetPrediction = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { betId } = req.params as { betId: string };
    const { side, amount } = req.body as CreatePredictionBody;

    if (side !== "A" && side !== "B") {
      return res.status(400).json({ message: "side must be 'A' or 'B'." });
    }

    const parsedAmount = parsePositiveAmount(amount);
    if (parsedAmount === null) {
      return res.status(400).json({
        message: "amount must be a positive number.",
      });
    }

    const bet = await Bet.findByPk(betId);
    if (!bet) {
      return res.status(404).json({ message: "Bet not found." });
    }

    if (bet.status !== "live") {
      return res
        .status(400)
        .json({ message: "Predictions can only be placed on LIVE bets." });
    }

    const now = new Date();
    if (now < bet.startAt) {
      return res.status(400).json({
        message: "Bet is not live yet.",
      });
    }
    if (now > bet.endAt) {
      return res.status(400).json({
        message: "Bet has already ended.",
      });
    }

    const minStake = Number(bet.stakeAmount);
    if (!Number.isNaN(minStake) && parsedAmount < minStake) {
      return res.status(400).json({
        message: "amount is below the minimum stake for this bet.",
      });
    }

    const prediction = await BetPrediction.create({
      betId,
      userId: req.user.id,
      side,
      amount: String(parsedAmount),
    });

    return res.status(201).json({
      message: "Prediction created successfully.",
      data: prediction,
    });
  } catch (error) {
    next(error);
  }
};
