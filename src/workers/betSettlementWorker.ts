import cron from "node-cron";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { formatEther, isAddress, parseEther } from "viem";
import type { Address } from "viem";
import { sequelize } from "../config/database";
import { Bet } from "../models/Bet";
import {
  BetPayout,
  type BetPayoutCreationAttributes,
} from "../models/BetPayout";
import { BetPrediction } from "../models/BetPrediction";
import { Transfer } from "../models/Transfer";
import {
  getEstimatedGasPriceWei,
  getWalletBalanceWei,
  sendWalletTransaction,
  waitForWalletTransactionReceipt,
  walletAddress,
  walletChainId,
} from "../utils/web3";
import { getAVAXtoUSDRate } from "../utils/jackpot.utils";

const PLATFORM_FEE_PERCENTAGE = 5;

const roundAmount = (amount: number): number =>
  Number((Math.round(amount * 1e8) / 1e8).toFixed(8));

const makeRunId = (): string =>
  `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;

const log = (runId: string, message: string, ...args: unknown[]) => {
  console.log(`[Bet Settlement Worker][${runId}] ${message}`, ...args);
};

const warn = (runId: string, message: string, ...args: unknown[]) => {
  console.warn(`[Bet Settlement Worker][${runId}] ${message}`, ...args);
};

const err = (runId: string, message: string, ...args: unknown[]) => {
  console.error(`[Bet Settlement Worker][${runId}] ${message}`, ...args);
};

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

type UserWalletStakeSummary = {
  userId: string;
  walletAddress: string;
  amountOnA: number;
  amountOnB: number;
};

type BetEvaluatorResponse = {
  favored_competitor?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
};

type CoreStakeSummary = {
  creatorStake: number;
  opponentStake: number;
};

type BetEvaluatorRequestPayload = {
  competitor_a: string;
  competitor_b: string;
  description: string;
};

type PendingWinnerPayout = BetPayout & {
  bet: Bet;
};

const YES_LABELS = new Set(["yes", "y", "true", "1"]);
const NO_LABELS = new Set(["no", "n", "false", "0"]);

const isBetAutoEvaluationEnabled = (): boolean => {
  const raw = process.env.BET_AUTO_EVALUATION_ENABLED?.trim().toLowerCase();
  if (!raw) return true;
  return ["1", "true", "yes", "on"].includes(raw);
};

const isBetPayoutEnabled = (): boolean => {
  const raw = process.env.BET_PAYOUTS_ONCHAIN_ENABLED?.trim().toLowerCase();
  if (!raw) return true;
  return ["1", "true", "yes", "on"].includes(raw);
};

const getBetEvaluatorUrl = (): string =>
  process.env.BET_EVALUATOR_URL?.trim() || "http://127.0.0.1:8000/evaluate";

const getBetEvaluatorTimeoutMs = (): number => {
  const raw = Number(process.env.BET_EVALUATOR_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
};

const getNetworkLabel = (): string =>
  walletChainId === 43114 ? "avalanche-c-chain" : "avalanche-fuji";

const normalizeBinaryLabel = (value: string): "Yes" | "No" | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (YES_LABELS.has(normalized)) return "Yes";
  if (NO_LABELS.has(normalized)) return "No";
  return null;
};

const buildEvaluatorPayloadFromBet = (bet: Bet): BetEvaluatorRequestPayload => {
  const competitorA = bet.creatorSide === "A" ? "Yes" : "No";
  const competitorB = bet.creatorSide === "B" ? "Yes" : "No";

  const descriptionParts = [bet.description.trim(), bet.endCondition.trim()]
    .filter((part) => part.length > 0)
    .filter((part, index, arr) => arr.indexOf(part) === index);

  const description =
    descriptionParts.join(" ") ||
    bet.title.trim() ||
    `${bet.competitorAName} vs ${bet.competitorBName}`;

  return {
    competitor_a: competitorA,
    competitor_b: competitorB,
    description,
  };
};

const mapFavoredCompetitorToSide = (
  favoredCompetitor: unknown,
  bet: Bet,
): Side | null => {
  if (typeof favoredCompetitor !== "string") return null;

  const normalized = favoredCompetitor.trim();
  if (!normalized) return null;

  const upper = normalized.toUpperCase();
  if (upper === "A" || upper === "B") return upper;
  if (upper === "1") return "A";
  if (upper === "2") return "B";

  const lower = normalized.toLowerCase();
  const competitorALower = bet.competitorAName.trim().toLowerCase();
  const competitorBLower = bet.competitorBName.trim().toLowerCase();
  const competitorABinary = normalizeBinaryLabel(bet.competitorAName);
  const competitorBBinary = normalizeBinaryLabel(bet.competitorBName);
  const favoredBinary = normalizeBinaryLabel(normalized);

  if (lower === "competitor_a" || lower === "option_a" || lower === "side_a") {
    return "A";
  }
  if (lower === "competitor_b" || lower === "option_b" || lower === "side_b") {
    return "B";
  }
  if (lower === competitorALower) return "A";
  if (lower === competitorBLower) return "B";
  if (favoredBinary && competitorABinary === favoredBinary) return "A";
  if (favoredBinary && competitorBBinary === favoredBinary) return "B";

  return null;
};

const getCoreParticipantStakeSummary = async (
  bet: Bet,
): Promise<CoreStakeSummary | null> => {
  if (!bet.opponentUserId) return null;

  const predictions = await BetPrediction.findAll({
    where: {
      betId: bet.id,
      userId: { [Op.in]: [bet.createdByUserId, bet.opponentUserId] },
    },
  });

  let creatorStake = 0;
  let opponentStake = 0;

  for (const prediction of predictions) {
    const amount = Number(prediction.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (prediction.userId === bet.createdByUserId) {
      creatorStake += amount;
      continue;
    }

    if (prediction.userId === bet.opponentUserId) {
      opponentStake += amount;
    }
  }

  return {
    creatorStake: roundAmount(creatorStake),
    opponentStake: roundAmount(opponentStake),
  };
};

const convertBetPayoutToAvax = async (
  bet: Bet,
  payoutAmount: number,
  runId: string,
): Promise<number> => {
  const currency = bet.currency.trim().toUpperCase();

  if (currency === "AVAX") {
    return payoutAmount;
  }

  if (currency === "USD") {
    const avaxRate = await getAVAXtoUSDRate();
    if (avaxRate <= 0) {
      throw new Error("Invalid AVAX/USD rate for payout conversion");
    }

    const converted = payoutAmount / avaxRate;
    log(
      runId,
      `Converted payout for bet=${bet.id} from USD ${payoutAmount} to AVAX ${converted} using rate=${avaxRate}`,
    );
    return converted;
  }

  throw new Error(
    `Unsupported bet currency "${bet.currency}" for on-chain payout`,
  );
};

const selectWinnerUsingEvaluator = async (
  bet: Bet,
  runId: string,
): Promise<Side | null> => {
  const controller = new AbortController();
  const timeoutMs = getBetEvaluatorTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const payload = buildEvaluatorPayloadFromBet(bet);
  const evaluatorUrl = getBetEvaluatorUrl();

  log(
    runId,
    `Calling evaluator for bet=${bet.id}, url=${evaluatorUrl}, timeoutMs=${timeoutMs}, payload=${JSON.stringify(payload)}`,
  );

  try {
    const response = await fetch(evaluatorUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    log(runId, `Evaluator HTTP status for bet=${bet.id}: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Evaluator returned ${response.status}: ${errorBody.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as BetEvaluatorResponse;
    log(
      runId,
      `Evaluator raw response for bet=${bet.id}: ${JSON.stringify(data)}`,
    );

    const winnerSide = mapFavoredCompetitorToSide(data.favored_competitor, bet);

    if (!winnerSide) {
      throw new Error(
        `Could not map favored_competitor="${String(data.favored_competitor)}" to side A/B`,
      );
    }

    log(
      runId,
      `Evaluator winner mapped for bet=${bet.id}: side=${winnerSide}, confidence=${String(data.confidence ?? "unknown")}`,
    );

    if (typeof data.reasoning === "string" && data.reasoning.trim()) {
      log(
        runId,
        `Evaluator reasoning for bet=${bet.id}: ${data.reasoning.slice(0, 500)}`,
      );
    }

    return winnerSide;
  } finally {
    clearTimeout(timeout);
  }
};

const selectWinnersForEndedBets = async (runId: string) => {
  if (!isBetAutoEvaluationEnabled()) {
    log(runId, "Auto-evaluation disabled via BET_AUTO_EVALUATION_ENABLED");
    return;
  }

  const now = new Date();
  log(runId, `Selecting winners for ended bets at ${now.toISOString()}`);

  const bets = await Bet.findAll({
    where: {
      status: "live",
      winnerSide: { [Op.is]: null },
      opponentUserId: { [Op.ne]: null },
      endAt: { [Op.lte]: now },
    },
    order: [["endAt", "ASC"]],
  });

  log(runId, `Found ${bets.length} ended live bets needing winner evaluation`);

  for (const bet of bets) {
    try {
      log(
        runId,
        `Evaluating bet=${bet.id}, title="${bet.title}", endAt=${bet.endAt.toISOString()}, creator=${bet.createdByUserId}, opponent=${bet.opponentUserId}`,
      );

      const coreStakeSummary = await getCoreParticipantStakeSummary(bet);
      log(
        runId,
        `Core stake summary for bet=${bet.id}: ${JSON.stringify(coreStakeSummary)}`,
      );

      if (
        !coreStakeSummary ||
        coreStakeSummary.creatorStake <= 0 ||
        coreStakeSummary.opponentStake <= 0
      ) {
        warn(
          runId,
          `Skipping evaluator for bet=${bet.id}: creator/opponent stake missing`,
        );
        continue;
      }

      const winnerSide = await selectWinnerUsingEvaluator(bet, runId);
      if (!winnerSide) {
        warn(runId, `Evaluator returned no winner for bet=${bet.id}`);
        continue;
      }

      const [updatedCount] = await Bet.update(
        {
          winnerSide,
          pickedWinnerByUserId: null,
        },
        {
          where: {
            id: bet.id,
            status: "live",
            winnerSide: { [Op.is]: null },
          },
        },
      );

      if (!updatedCount) {
        log(
          runId,
          `Skipped winner update for bet=${bet.id}: already handled by another flow`,
        );
        continue;
      }

      log(runId, `Winner saved for bet=${bet.id}: winnerSide=${winnerSide}`);
    } catch (error) {
      err(runId, `Failed to evaluate winner for bet=${bet.id}`, error);
    }
  }
};

const settleBet = async (betId: string, runId: string) => {
  const tx = await sequelize.transaction();
  log(runId, `Starting settlement transaction for bet=${betId}`);

  try {
    const bet = await Bet.findByPk(betId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    if (
      !bet ||
      bet.status !== "live" ||
      !bet.winnerSide ||
      !bet.opponentUserId
    ) {
      log(
        runId,
        `Skipping settleBet for bet=${betId}: bet missing or invalid state (status=${bet?.status}, winnerSide=${bet?.winnerSide}, opponent=${bet?.opponentUserId})`,
      );
      await tx.rollback();
      return;
    }

    log(
      runId,
      `Settlement context bet=${bet.id}: creator=${bet.createdByUserId}, opponent=${bet.opponentUserId}, creatorSide=${bet.creatorSide}, winnerSide=${bet.winnerSide}, currency=${bet.currency}`,
    );

    const predictions = await BetPrediction.findAll({
      where: { betId: bet.id },
      transaction: tx,
    });

    log(runId, `Loaded ${predictions.length} predictions for bet=${bet.id}`);

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
      log(runId, `Bet=${bet.id} closed due to zero predictions`);
      return;
    }

    const aggregatedBySide = aggregatePredictions(predictions).filter(
      (entry) => entry.totalAmount > 0,
    );
    log(
      runId,
      `Aggregated side predictions for bet=${bet.id}: ${JSON.stringify(aggregatedBySide)}`,
    );

    const userWalletStakeMap = new Map<string, UserWalletStakeSummary>();

    for (const prediction of predictions) {
      const amount = Number(prediction.amount);
      const payoutWalletAddress = prediction.walletAddress?.trim();

      if (!Number.isFinite(amount) || amount <= 0 || !payoutWalletAddress) {
        continue;
      }

      const key = `${prediction.userId}:${payoutWalletAddress.toLowerCase()}`;
      const current = userWalletStakeMap.get(key) ?? {
        userId: prediction.userId,
        walletAddress: payoutWalletAddress,
        amountOnA: 0,
        amountOnB: 0,
      };

      if (prediction.side === "A") current.amountOnA += amount;
      if (prediction.side === "B") current.amountOnB += amount;

      userWalletStakeMap.set(key, current);
    }

    log(
      runId,
      `Wallet-level stake map for bet=${bet.id}: ${JSON.stringify(Array.from(userWalletStakeMap.values()))}`,
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

    log(
      runId,
      `Pool math bet=${bet.id}: totalOnA=${totalOnA}, totalOnB=${totalOnB}, totalPool=${totalPool}, creatorStake=${creatorStake}, opponentStake=${opponentStake}, headToHeadPool=${headToHeadPool}, publicPool=${publicPool}, publicOnWinningSide=${publicOnWinningSide}`,
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
      warn(
        runId,
        `Bet=${bet.id} closed due to invalid pool/required stakes (totalPool=${totalPool}, creatorStake=${creatorStake}, opponentStake=${opponentStake})`,
      );
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
    const coreWinnerWinningStakeTotal = roundAmount(
      Array.from(userWalletStakeMap.values())
        .filter((entry) => entry.userId === headToHeadWinnerId)
        .reduce(
          (sum, entry) =>
            sum + (winnerSide === "A" ? entry.amountOnA : entry.amountOnB),
          0,
        ),
    );

    log(
      runId,
      `Fee math bet=${bet.id}: platformFee=${platformFeeAmount}, payoutPool=${payoutPoolAmount}, headToHeadFee=${headToHeadFee}, publicPoolFee=${publicPoolFee}, headToHeadPayoutPool=${headToHeadPayoutPool}, publicPayoutPool=${publicPayoutPool}, coreWinner=${headToHeadWinnerId}, coreWinnerWinningStakeTotal=${coreWinnerWinningStakeTotal}`,
    );

    const deletedPayoutRows = await BetPayout.destroy({
      where: { betId: bet.id },
      transaction: tx,
    });
    log(runId, `Deleted ${deletedPayoutRows} old payout rows for bet=${bet.id}`);

    const payoutRows: BetPayoutCreationAttributes[] = Array.from(
      userWalletStakeMap.values(),
    ).map((stake) => {
      const amountOnWinningSide =
        winnerSide === "A" ? stake.amountOnA : stake.amountOnB;
      const stakedAmount = roundAmount(stake.amountOnA + stake.amountOnB);
      const isCoreParticipant =
        stake.userId === bet.createdByUserId ||
        stake.userId === bet.opponentUserId;
      const isHeadToHeadWinner = stake.userId === headToHeadWinnerId;
      const grossPayoutAmount = roundAmount(
        isCoreParticipant
          ? isHeadToHeadWinner && coreWinnerWinningStakeTotal > 0
            ? (headToHeadPool * amountOnWinningSide) /
              coreWinnerWinningStakeTotal
            : 0
          : publicOnWinningSide > 0
            ? (publicPool * amountOnWinningSide) / publicOnWinningSide
            : 0,
      );
      const feeChargedAmount = roundAmount(
        isCoreParticipant
          ? isHeadToHeadWinner && coreWinnerWinningStakeTotal > 0
            ? (headToHeadFee * amountOnWinningSide) / coreWinnerWinningStakeTotal
            : 0
          : publicOnWinningSide > 0
            ? (publicPoolFee * amountOnWinningSide) / publicOnWinningSide
            : 0,
      );
      const netPayoutAmount = roundAmount(
        isCoreParticipant
          ? isHeadToHeadWinner && coreWinnerWinningStakeTotal > 0
            ? (headToHeadPayoutPool * amountOnWinningSide) /
              coreWinnerWinningStakeTotal
            : 0
          : publicOnWinningSide > 0
            ? (publicPayoutPool * amountOnWinningSide) / publicOnWinningSide
            : 0,
      );
      const isWinner = isCoreParticipant
        ? isHeadToHeadWinner &&
          amountOnWinningSide > 0 &&
          coreWinnerWinningStakeTotal > 0
        : amountOnWinningSide > 0 && publicOnWinningSide > 0;

      return {
        betId: bet.id,
        userId: stake.userId,
        walletAddress: stake.walletAddress,
        side: winnerSide,
        stakedAmount: String(stakedAmount),
        grossPayoutAmount: String(grossPayoutAmount),
        feeChargedAmount: String(feeChargedAmount),
        netPayoutAmount: String(netPayoutAmount),
        isWinner,
        status: isWinner && netPayoutAmount > 0 ? "pending" : "processed",
      };
    });

    log(
      runId,
      `Prepared ${payoutRows.length} payout rows for bet=${bet.id}: ${JSON.stringify(payoutRows)}`,
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
    log(runId, `Settlement committed successfully for bet=${bet.id}`);
  } catch (error) {
    await tx.rollback();
    err(runId, `Settlement rolled back for bet=${betId}`, error);
    throw error;
  }
};

const processPendingWinnerPayoutTransfers = async (runId: string) => {
  if (!isBetPayoutEnabled()) {
    log(runId, "On-chain payouts disabled via BET_PAYOUTS_ONCHAIN_ENABLED");
    return;
  }

  const pendingPayouts = (await BetPayout.findAll({
    where: {
      status: "pending",
      isWinner: true,
    },
    include: [
      {
        model: Bet,
        as: "bet",
        required: true,
        where: { status: "settled" },
      },
    ],
    order: [["createdAt", "ASC"]],
  })) as PendingWinnerPayout[];

  log(runId, `Found ${pendingPayouts.length} pending winner payouts`);

  if (!pendingPayouts.length) {
    return;
  }

  const payoutPlans: Array<{
    payoutId: string;
    betId: string;
    toWallet: Address;
    amountAVAX: number;
    amountAVAXStr: string;
  }> = [];

  for (const payout of pendingPayouts) {
    try {
      const netPayout = Number(payout.netPayoutAmount);
      log(
        runId,
        `Preparing payout=${payout.id}, bet=${payout.betId}, user=${payout.userId}, wallet=${payout.walletAddress}, net=${payout.netPayoutAmount}`,
      );

      if (!Number.isFinite(netPayout) || netPayout <= 0) {
        await payout.update({ status: "processed" });
        warn(
          runId,
          `Marked payout=${payout.id} as processed because net amount is invalid/non-positive (${payout.netPayoutAmount})`,
        );
        continue;
      }

      const toWallet = payout.walletAddress?.trim();
      if (!toWallet) {
        warn(
          runId,
          `Missing prediction walletAddress for winner user=${payout.userId} payout=${payout.id}`,
        );
        continue;
      }

      if (!isAddress(toWallet)) {
        warn(
          runId,
          `Invalid walletAddress for winner user=${payout.userId} payout=${payout.id}: ${toWallet}`,
        );
        continue;
      }

      const amountAVAX = await convertBetPayoutToAvax(payout.bet, netPayout, runId);
      if (!Number.isFinite(amountAVAX) || amountAVAX <= 0) {
        await payout.update({ status: "processed" });
        warn(
          runId,
          `Marked payout=${payout.id} as processed because converted AVAX is invalid/non-positive (${amountAVAX})`,
        );
        continue;
      }

      payoutPlans.push({
        payoutId: payout.id,
        betId: payout.betId,
        toWallet,
        amountAVAX,
        amountAVAXStr: amountAVAX.toFixed(18),
      });
    } catch (error) {
      err(runId, `Failed to prepare payout=${payout.id}`, error);
    }
  }

  log(runId, `Prepared ${payoutPlans.length} payout transfer plans`);

  if (!payoutPlans.length) {
    return;
  }

  const treasuryBalanceWei = await getWalletBalanceWei();
  const gasPriceWei = await getEstimatedGasPriceWei();
  const estimatedGasWei =
    gasPriceWei !== null && gasPriceWei > 0n
      ? gasPriceWei * 21_000n * BigInt(payoutPlans.length)
      : parseEther("0.01");

  const totalPayoutWei = payoutPlans.reduce(
    (sum, payout) => sum + parseEther(payout.amountAVAXStr),
    0n,
  );
  const totalRequiredWei = totalPayoutWei + estimatedGasWei;

  log(
    runId,
    `Treasury check: balance=${formatEther(treasuryBalanceWei)} AVAX, totalPayout=${formatEther(totalPayoutWei)} AVAX, estimatedGas=${formatEther(estimatedGasWei)} AVAX, required=${formatEther(totalRequiredWei)} AVAX`,
  );

  if (treasuryBalanceWei < totalRequiredWei) {
    err(
      runId,
      `Treasury has insufficient AVAX for winner payouts. required=${formatEther(totalRequiredWei)} AVAX, balance=${formatEther(treasuryBalanceWei)} AVAX`,
    );
    return;
  }

  let successfulTransfers = 0;

  for (const payout of payoutPlans) {
    const [claimedCount] = await BetPayout.update(
      { status: "processing" },
      {
        where: {
          id: payout.payoutId,
          status: "pending",
        },
      },
    );

    if (!claimedCount) {
      log(
        runId,
        `Skipped payout=${payout.payoutId} claim because row is no longer pending`,
      );
      continue;
    }

    try {
      const amountWei = parseEther(payout.amountAVAXStr);
      log(
        runId,
        `Sending payout tx for payout=${payout.payoutId}, bet=${payout.betId}, to=${payout.toWallet}, amountAVAX=${payout.amountAVAXStr}`,
      );

      const txHash = await sendWalletTransaction({
        to: payout.toWallet,
        value: amountWei,
      });
      log(runId, `Tx submitted for payout=${payout.payoutId}: ${txHash}`);

      const receipt = await waitForWalletTransactionReceipt(txHash);

      if (!receipt) {
        throw new Error("Transaction failed (no receipt)");
      }

      log(
        runId,
        `Tx confirmed for payout=${payout.payoutId}: ${receipt.transactionHash}`,
      );

      const tx = await sequelize.transaction();
      try {
        await BetPayout.update(
          { status: "processed" },
          {
            where: { id: payout.payoutId },
            transaction: tx,
          },
        );

        await Transfer.create(
          {
            id: uuidv4(),
            amount: payout.amountAVAX.toFixed(8),
            currency: "AVAX",
            fromWallet: walletAddress,
            toWallet: payout.toWallet,
            txHash: receipt.transactionHash,
            betId: payout.betId,
            network: getNetworkLabel(),
          },
          { transaction: tx },
        );

        await tx.commit();
        successfulTransfers += 1;
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      log(
        runId,
        `Payout marked processed and transfer recorded for payout=${payout.payoutId}, bet=${payout.betId}`,
      );
    } catch (error) {
      await BetPayout.update(
        { status: "pending" },
        { where: { id: payout.payoutId } },
      );
      err(runId, `Failed payout transfer for payout=${payout.payoutId}`, error);
    }
  }

  log(
    runId,
    `Payout transfer summary: success=${successfulTransfers}, attempted=${payoutPlans.length}, failed=${payoutPlans.length - successfulTransfers}`,
  );
};

export const processPendingBetSettlements = async () => {
  const runId = makeRunId();
  const now = new Date();
  log(
    runId,
    `Run started at ${now.toISOString()} | autoEval=${isBetAutoEvaluationEnabled()} | onchainPayout=${isBetPayoutEnabled()}`,
  );

  await selectWinnersForEndedBets(runId);

  const bets = await Bet.findAll({
    where: {
      status: "live",
      winnerSide: { [Op.in]: ["A", "B"] },
      endAt: { [Op.lte]: new Date() },
    },
    order: [["endAt", "ASC"]],
  });

  log(runId, `Found ${bets.length} live bets ready for settlement`);

  for (const bet of bets) {
    try {
      await settleBet(bet.id, runId);
      log(runId, `Finished settleBet for bet=${bet.id}`);
    } catch (error) {
      err(runId, `Failed settleBet for bet=${bet.id}`, error);
    }
  }

  await processPendingWinnerPayoutTransfers(runId);

  log(runId, "Run completed");
};

export const startBetSettlementWorker = () => {
  console.log(
    `[Bet Settlement Worker] Scheduler started with cron="* * * * *" | network=${getNetworkLabel()} | treasuryWallet=${walletAddress}`,
  );

  cron.schedule("* * * * *", async () => {
    try {
      await processPendingBetSettlements();
    } catch (error) {
      console.error("[Bet Settlement Worker] Run failed", error);
    }
  });
};
