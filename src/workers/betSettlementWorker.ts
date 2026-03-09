import cron from "node-cron";
import { Op } from "sequelize";
import { sequelize } from "../config/database";
import { Bet } from "../models/Bet";
import { BetPayout } from "../models/BetPayout";
import { BetPrediction } from "../models/BetPrediction";

const PLATFORM_FEE_PERCENTAGE = 5;

const roundAmount = (amount: number): number =>
  Number((Math.round(amount * 1e8) / 1e8).toFixed(8));

type Side = "A" | "B";

type AggregatedSidePrediction = {
  userId: string;
  side: Side;
  totalAmount: number;
};

const aggregatePredictions = (
  predictions: BetPrediction[],
): AggregatedSidePrediction[] => {
  const map = new Map<string, AggregatedSidePrediction>();

  for (const prediction of predictions) {
    const key = `${prediction.userId}:${prediction.side}`;
    const current = map.get(key);
    const amount = Number(prediction.amount);

    if (!current) {
      map.set(key, {
        userId: prediction.userId,
        side: prediction.side,
        totalAmount: Number.isNaN(amount) ? 0 : amount,
      });
      continue;
    }

    current.totalAmount += Number.isNaN(amount) ? 0 : amount;
  }

  return Array.from(map.values());
};

type UserStakeSummary = {
  amountOnA: number;
  amountOnB: number;
};

const settleBet = async (betId: string) => {
  const tx = await sequelize.transaction();

  try {
    const bet = await Bet.findByPk(betId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    if (!bet || bet.status !== "live" || !bet.winnerSide || !bet.opponentUserId) {
      await tx.rollback();
      return;
    }

    const predictions = await BetPrediction.findAll({
      where: { betId: bet.id },
      transaction: tx,
    });

    if (!predictions.length) {
      await bet.update(
        {
          status: "closed",
          settledAt: new Date(),
          totalPoolAmount: "0",
          platformFeeAmount: "0",
          payoutPoolAmount: "0",
        },
        { transaction: tx },
      );

      await tx.commit();
      return;
    }

    const aggregatedBySide = aggregatePredictions(predictions).filter(
      (entry) => entry.totalAmount > 0,
    );

    const userStakeMap = new Map<string, UserStakeSummary>();
    for (const entry of aggregatedBySide) {
      const current = userStakeMap.get(entry.userId) ?? {
        amountOnA: 0,
        amountOnB: 0,
      };

      if (entry.side === "A") current.amountOnA += entry.totalAmount;
      if (entry.side === "B") current.amountOnB += entry.totalAmount;

      userStakeMap.set(entry.userId, current);
    }

    const totalOnA = aggregatedBySide
      .filter((entry) => entry.side === "A")
      .reduce((sum, entry) => sum + entry.totalAmount, 0);
    const totalOnB = aggregatedBySide
      .filter((entry) => entry.side === "B")
      .reduce((sum, entry) => sum + entry.totalAmount, 0);

    const totalPool = roundAmount(totalOnA + totalOnB);
    const creatorSide = bet.creatorSide;
    const opponentSide: Side = creatorSide === "A" ? "B" : "A";
    const winnerSide = bet.winnerSide;
    const creatorStake = roundAmount(
      creatorSide === "A"
        ? (userStakeMap.get(bet.createdByUserId)?.amountOnA ?? 0)
        : (userStakeMap.get(bet.createdByUserId)?.amountOnB ?? 0),
    );
    const opponentStake = roundAmount(
      opponentSide === "A"
        ? (userStakeMap.get(bet.opponentUserId)?.amountOnA ?? 0)
        : (userStakeMap.get(bet.opponentUserId)?.amountOnB ?? 0),
    );

    const headToHeadPool = roundAmount(creatorStake + opponentStake);
    const publicPool = roundAmount(totalPool - headToHeadPool);
    const publicOnWinningSide = roundAmount(
      aggregatedBySide
        .filter(
          (entry) =>
            entry.userId !== bet.createdByUserId &&
            entry.userId !== bet.opponentUserId &&
            entry.side === winnerSide,
        )
        .reduce((sum, entry) => sum + entry.totalAmount, 0),
    );

    if (totalPool <= 0 || creatorStake <= 0 || opponentStake <= 0) {
      await bet.update(
        {
          status: "closed",
          settledAt: new Date(),
          totalPoolAmount: String(totalPool),
          platformFeeAmount: "0",
          payoutPoolAmount: String(totalPool),
        },
        { transaction: tx },
      );

      await tx.commit();
      return;
    }

    const platformFeeAmount = roundAmount(
      (totalPool * PLATFORM_FEE_PERCENTAGE) / 100,
    );
    const payoutPoolAmount = roundAmount(totalPool - platformFeeAmount);
    const headToHeadFee = roundAmount(
      (headToHeadPool * PLATFORM_FEE_PERCENTAGE) / 100,
    );
    const publicPoolFee = roundAmount(
      (publicPool * PLATFORM_FEE_PERCENTAGE) / 100,
    );
    const headToHeadPayoutPool = roundAmount(headToHeadPool - headToHeadFee);
    const publicPayoutPool = roundAmount(publicPool - publicPoolFee);
    const headToHeadWinnerId =
      winnerSide === creatorSide ? bet.createdByUserId : bet.opponentUserId;

    await BetPayout.destroy({
      where: { betId: bet.id },
      transaction: tx,
    });

    const payoutRows = Array.from(userStakeMap.entries()).map(
      ([userId, stake]) => {
        const amountOnWinningSide =
          winnerSide === "A" ? stake.amountOnA : stake.amountOnB;
        const stakedAmount = roundAmount(stake.amountOnA + stake.amountOnB);
        const isCoreParticipant =
          userId === bet.createdByUserId || userId === bet.opponentUserId;
        const isHeadToHeadWinner = userId === headToHeadWinnerId;

        return {
          betId: bet.id,
          userId,
          side: winnerSide,
          stakedAmount: String(stakedAmount),
          grossPayoutAmount: String(
            roundAmount(
              isCoreParticipant
                ? isHeadToHeadWinner
                  ? headToHeadPool
                  : 0
                : publicOnWinningSide > 0
                  ? (publicPool * amountOnWinningSide) / publicOnWinningSide
                  : 0,
            ),
          ),
          feeChargedAmount: String(
            roundAmount(
              isCoreParticipant
                ? isHeadToHeadWinner
                  ? headToHeadFee
                  : 0
                : publicOnWinningSide > 0
                  ? (publicPoolFee * amountOnWinningSide) / publicOnWinningSide
                  : 0,
            ),
          ),
          netPayoutAmount: String(
            roundAmount(
              isCoreParticipant
                ? isHeadToHeadWinner
                  ? headToHeadPayoutPool
                  : 0
                : publicOnWinningSide > 0
                  ? (publicPayoutPool * amountOnWinningSide) /
                    publicOnWinningSide
                  : 0,
            ),
          ),
          isWinner: isCoreParticipant
            ? isHeadToHeadWinner
            : amountOnWinningSide > 0 && publicOnWinningSide > 0,
          status: "pending" as const,
        };
      },
    );

    await BetPayout.bulkCreate(payoutRows, { transaction: tx });

    await bet.update(
      {
        status: "settled",
        settledAt: new Date(),
        totalPoolAmount: String(totalPool),
        platformFeeAmount: String(platformFeeAmount),
        payoutPoolAmount: String(payoutPoolAmount),
      },
      { transaction: tx },
    );

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

export const processPendingBetSettlements = async () => {
  const now = new Date();

  const bets = await Bet.findAll({
    where: {
      status: "live",
      winnerSide: { [Op.in]: ["A", "B"] },
      endAt: { [Op.lte]: now },
    },
    order: [["endAt", "ASC"]],
  });

  for (const bet of bets) {
    try {
      await settleBet(bet.id);
      console.log(`[Bet Settlement Worker] Settled bet ${bet.id}`);
    } catch (error) {
      console.error(`[Bet Settlement Worker] Failed for bet ${bet.id}`, error);
    }
  }
};

export const startBetSettlementWorker = () => {
  cron.schedule("* * * * *", async () => {
    try {
      await processPendingBetSettlements();
    } catch (error) {
      console.error("[Bet Settlement Worker] Run failed", error);
    }
  });
};
