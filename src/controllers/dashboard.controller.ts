import { Op, fn, col, QueryTypes } from "sequelize";
import { Bet } from "../models/Bet";
import { BetPrediction } from "../models/BetPrediction";
import { Jackpot } from "../models/Jackpot";
import { JackpotEntry } from "../models/JackpotEntry";
import { sequelize } from "../config/database";
import { Request, Response, NextFunction } from "express";

export const getDashboardOverview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // 🔹 Active Bets Count
    const activeBets = await Bet.count({
      where: { status: "live" },
    });

    // 🔹 Recent Bets with participant count
    const recentBets = await Bet.findAll({
      limit: 5,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: BetPrediction,
          as: "predictions",
          attributes: [],
        },
      ],
      attributes: {
        include: [[fn("COUNT", col("predictions.id")), "participants"]],
      },
      group: ["Bet.id"],
      subQuery: false,
    });

    const [tvlRow] = await sequelize.query<{
      tvl: string;
      currency: string | null;
      currencyCount: number;
    }>(
      `
  SELECT
    COALESCE(SUM(bp.amount), 0) AS tvl,
    MIN(b.currency) AS currency,
    COUNT(DISTINCT b.currency) AS currencyCount
  FROM \`bets\` b
  LEFT JOIN \`bet_predictions\` bp ON bp.\`betId\` = b.\`id\`
  WHERE b.\`status\` = 'live'
  `,
      { type: QueryTypes.SELECT },
    );

    const totalValueLocked = Number(tvlRow?.tvl ?? 0);
    const tvlCurrency =
      Number(tvlRow?.currencyCount ?? 0) <= 1
        ? (tvlRow?.currency ?? null)
        : "MIXED";

    // 🔹 Active Users (distinct predictors)
    const activeUsers = await BetPrediction.count({
      distinct: true,
      col: "userId",
    });

    // 🔹 Active Jackpot
    const activeJackpot = await Jackpot.findOne({
      where: {
        isActive: true,
        startAt: { [Op.lte]: new Date() },
        endAt: { [Op.gte]: new Date() },
      },
      include: [
        {
          model: JackpotEntry,
          as: "entries",
          attributes: [],
        },
      ],
      attributes: [
        "id",
        "name",
        "startAt",
        "endAt",
        "minAmount",
        "currency",
        "isActive",
        "createdAt",
        "updatedAt",
        [fn("COUNT", col("entries.id")), "totalEntries"],
      ],
      group: [
        "Jackpot.id",
        "Jackpot.name",
        "Jackpot.startAt",
        "Jackpot.endAt",
        "Jackpot.minAmount",
        "Jackpot.currency",
        "Jackpot.isActive",
        "Jackpot.createdAt",
        "Jackpot.updatedAt",
      ],
      subQuery: false,
    });

    return res.json({
      stats: {
        totalValueLocked,
        currency: tvlCurrency,
        activeBets,
        activeUsers,
      },
      recentBets,
      jackpot: activeJackpot,
    });
  } catch (error) {
    next(error);
  }
};
