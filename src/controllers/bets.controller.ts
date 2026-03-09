import { Request, Response, NextFunction } from "express";
import { Op, Sequelize, WhereOptions } from "sequelize";
import { isAddress } from "viem";
import { AuthenticatedRequest } from "../middleware/auth";
import { Bet, BetAttributes, BetStatus } from "../models/Bet";
import { BetPrediction, BetSide } from "../models/BetPrediction";
import { BetPayout } from "../models/BetPayout";
import { processPendingBetSettlements } from "../workers/betSettlementWorker";
import { sequelize } from "../config/database";

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
  side?: BetSide;
  walletAddress?: string;
}

interface PickWinnerBody {
  winnerSide: BetSide;
}

interface CreatePredictionBody {
  side: BetSide;
  amount: number | string;
  walletAddress: string;
}

interface AcceptBetInviteBody {
  walletAddress: string;
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
      side,
      walletAddress,
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
    if (!side || typeof side !== "string") {
      return res.status(400).json({ message: "side is required." });
    }
    if (side !== "A" && side !== "B") {
      return res.status(400).json({ message: "side must be A or B." });
    }

    const creatorSide: BetSide = side;
    const opponentSide: BetSide = creatorSide === "A" ? "B" : "A";
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

    const payoutWalletAddress =
      walletAddress?.trim() || req.user.walletAddress?.trim();
    if (!payoutWalletAddress) {
      return res.status(400).json({
        message:
          "walletAddress is required to place creator stake. Pass walletAddress or set it in profile.",
      });
    }

    if (!isAddress(payoutWalletAddress)) {
      return res.status(400).json({
        message: "walletAddress is invalid.",
      });
    }

    const resolvedStatus: BetStatus =
      status && typeof status === "string" ? (status as BetStatus) : "pending";

    // // --- DEPLOY BET ESCROW ON-CHAIN ---
    // let contractAddress: string | undefined;
    // try {
    //   // Convert stakeAmount to Wei
    //   const stakeInWei = ethers.parseEther(String(parsedStake));
    //   // Convert Date object to unix timestamp for the smart contract
    //   const endTimeUnix = Math.floor(end.getTime() / 1000);
    //   // Call the createBet method on BettingFactory
    //   const tx = await (bettingFactoryContract as any).createBet(
    //     title,
    //     competitorAName,
    //     competitorBName,
    //     stakeInWei,
    //     endTimeUnix,
    //   );
    //   // Wait for it to be mined
    //   const receipt = await tx.wait();
    //   // Extract the address of the newly deployed BetEscrow from the events
    //   // Find the BetCreated event (address indexed betAddress, string title, ...)
    //   const event = receipt.logs.find(
    //     (log: any) => log.fragment && log.fragment.name === "BetCreated",
    //   );
    //   // If ethers parsed the fragment, we grab it from args. Alternatively we grab from the returned topic.
    //   // Usually ethers v6 provides it in the logged event if the ABI has the BetCreated event correctly mapped.
    //   if (event && event.args) {
    //     contractAddress = event.args[0]; // The deployed address is the first arg
    //   } else {
    //     // Fallback manual parsing if args are missing but it's the exact ABI we just compiled
    //     const parsedLog = bettingFactoryContract.interface.parseLog({
    //       topics: receipt.logs[0].topics as string[],
    //       data: receipt.logs[0].data,
    //     });
    //     contractAddress = parsedLog?.args[0];
    //   }
    //   if (!contractAddress) {
    //     console.warn(
    //       "Could not find BetEscrow contract address in tx logs. Factory may have failed silently. hash:",
    //       tx.hash,
    //     );
    //   }
    // } catch (smartContractError) {
    //   console.error("Smart contract deployment failed:", smartContractError);
    //   return res.status(500).json({
    //     message:
    //       "Failed to deploy the betting contract to the blockchain. Check backend AVAX balance and config.",
    //     error: String(smartContractError),
    //   });
    // }
    // --- SAVE TO DATABASE ---
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
      opponentUserId: null,
      creatorSide,
      // contractAddress: contractAddress || "",
    });

    await BetPrediction.create({
      betId: bet.id,
      userId: req.user.id,
      side,
      amount: String(parsedStake),
      walletAddress: payoutWalletAddress,
    });

    return res.status(201).json({
      message: "Bet created successfully.",
      data: {
        ...bet.toJSON(),
        opponentSide,
      },
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
        payouts: await BetPayout.findAll({
          where: { betId },
          order: [
            ["isWinner", "DESC"],
            ["netPayoutAmount", "DESC"],
          ],
        }),
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
    const { side, amount, walletAddress } = req.body as CreatePredictionBody;

    if (side !== "A" && side !== "B") {
      return res.status(400).json({ message: "side must be 'A' or 'B'." });
    }

    const parsedAmount = parsePositiveAmount(amount);
    if (parsedAmount === null) {
      return res.status(400).json({
        message: "amount must be a positive number.",
      });
    }

    const predictionWalletAddress = walletAddress?.trim();
    if (!predictionWalletAddress) {
      return res.status(400).json({
        message: "walletAddress is required.",
      });
    }

    if (!isAddress(predictionWalletAddress)) {
      return res.status(400).json({
        message: "walletAddress is invalid.",
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

    const creatorId = bet.createdByUserId;
    const opponentId = bet.opponentUserId;
    if (!opponentId) {
      return res.status(400).json({
        message: "Bet is not ready yet. Opponent has not accepted invite.",
      });
    }
    const isCoreParticipant =
      req.user.id === creatorId || req.user.id === opponentId;

    const existingUserPredictions = await BetPrediction.findAll({
      where: {
        betId,
        userId: req.user.id,
      },
    });

    if (isCoreParticipant) {
      const expectedSide: BetSide =
        req.user.id === creatorId
          ? bet.creatorSide
          : bet.creatorSide === "A"
            ? "B"
            : "A";

      if (side !== expectedSide) {
        return res.status(400).json({
          message: `Invalid side. Your allowed side for this bet is ${expectedSide}.`,
        });
      }

      if (existingUserPredictions.length > 0) {
        return res.status(409).json({
          message:
            "Creator and opponent can place only one fixed stake in this bet.",
        });
      }

      if (parsedAmount !== minStake) {
        return res.status(400).json({
          message: `Creator/opponent stake must be exactly ${bet.stakeAmount}.`,
        });
      }
    } else {
      const oppositeSidePrediction = existingUserPredictions.find(
        (prediction) => prediction.side === (side === "A" ? "B" : "A"),
      );

      if (oppositeSidePrediction) {
        return res.status(409).json({
          message:
            "Public participants can add stake on only one side per bet.",
        });
      }
    }

    const prediction = await BetPrediction.create({
      betId,
      userId: req.user.id,
      side,
      amount: String(parsedAmount),
      walletAddress: predictionWalletAddress,
    });

    return res.status(201).json({
      message: "Prediction created successfully.",
      data: prediction,
    });
  } catch (error) {
    next(error);
  }
};

export const acceptBetInvite = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const tx = await sequelize.transaction();

  try {
    if (!req.user) {
      await tx.rollback();
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { betId } = req.params as { betId: string };
    const { walletAddress } = req.body as AcceptBetInviteBody;

    const inviteWalletAddress = walletAddress?.trim();
    if (!inviteWalletAddress) {
      await tx.rollback();
      return res.status(400).json({ message: "walletAddress is required." });
    }

    if (!isAddress(inviteWalletAddress)) {
      await tx.rollback();
      return res.status(400).json({ message: "walletAddress is invalid." });
    }

    const bet = await Bet.findByPk(betId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    if (!bet) {
      await tx.rollback();
      return res.status(404).json({ message: "Bet not found." });
    }

    if (bet.createdByUserId === req.user.id) {
      await tx.rollback();
      return res.status(400).json({
        message: "Bet creator cannot accept their own invite.",
      });
    }

    if (bet.opponentUserId && bet.opponentUserId !== req.user.id) {
      await tx.rollback();
      return res.status(409).json({
        message: "This bet already has an opponent.",
      });
    }

    if (bet.status !== "pending" && bet.opponentUserId !== req.user.id) {
      await tx.rollback();
      return res.status(400).json({
        message: "Only pending bets can be accepted.",
      });
    }

    if (!bet.opponentUserId) {
      await bet.update(
        {
          opponentUserId: req.user.id,
          status: "live",
        },
        { transaction: tx },
      );
    }

    const opponentSide: BetSide = bet.creatorSide === "A" ? "B" : "A";
    const existingOpponentPrediction = await BetPrediction.findOne({
      where: {
        betId: bet.id,
        userId: req.user.id,
      },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    if (!existingOpponentPrediction) {
      await BetPrediction.create(
        {
          betId: bet.id,
          userId: req.user.id,
          side: opponentSide,
          amount: String(bet.stakeAmount),
          walletAddress: inviteWalletAddress,
        },
        { transaction: tx },
      );
    } else if (
      existingOpponentPrediction.walletAddress.toLowerCase() !==
      inviteWalletAddress.toLowerCase()
    ) {
      await tx.rollback();
      return res.status(409).json({
        message:
          "Opponent stake already exists with a different walletAddress for this bet.",
      });
    }

    await tx.commit();

    return res.json({
      message: "Bet accepted successfully. Bet is now live.",
      data: bet,
    });
  } catch (error) {
    await tx.rollback();
    next(error);
  }
};

export const pickBetWinner = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { betId } = req.params as { betId: string };
    const { winnerSide } = req.body as PickWinnerBody;

    if (winnerSide !== "A" && winnerSide !== "B") {
      return res.status(400).json({
        message: "winnerSide must be 'A' or 'B'.",
      });
    }

    const bet = await Bet.findByPk(betId);
    if (!bet) {
      return res.status(404).json({ message: "Bet not found." });
    }

    if (bet.status !== "live") {
      return res.status(400).json({
        message: "Winner can only be picked for LIVE bets.",
      });
    }

    if (bet.createdByUserId !== req.user.id) {
      return res.status(403).json({
        message: "Only the bet creator can pick the winner.",
      });
    }

    if (new Date() < bet.endAt) {
      return res.status(400).json({
        message: "Winner cannot be picked before bet endAt.",
      });
    }

    if (!bet.opponentUserId) {
      return res.status(400).json({
        message: "Cannot pick winner before an opponent accepts the invite.",
      });
    }

    const predictions = await BetPrediction.findAll({
      where: { betId: bet.id },
    });
    const participants = new Set(predictions.map((p) => p.userId));
    if (
      !participants.has(bet.createdByUserId) ||
      !participants.has(bet.opponentUserId)
    ) {
      return res.status(400).json({
        message:
          "Both creator and opponent must place their stakes before picking winner.",
      });
    }

    bet.winnerSide = winnerSide;
    bet.pickedWinnerByUserId = req.user.id;
    await bet.save();

    await processPendingBetSettlements();

    const settledBet = await Bet.findByPk(bet.id, {
      include: [{ model: BetPayout, as: "payouts" }],
    });

    return res.json({
      message: "Winner picked successfully.",
      data: settledBet,
    });
  } catch (error) {
    next(error);
  }
};

// export const resolveBet = async (
//   req: Request<{ betId: string }>,
//   res: Response,
// ) => {
//   try {
//     // if (!req.user || req.user.role !== "admin") {
//     //   return res.status(403).json({ message: "Only admin can resolve bets." });
//     // }

//     const { betId } = req.params;
//     const { winner } = req.body; // 1 = A, 2 = B

//     if (![1, 2].includes(winner)) {
//       return res.status(400).json({ message: "Winner must be 1 or 2." });
//     }

//     const bet = await Bet.findByPk(betId);
//     if (!bet) {
//       return res.status(404).json({ message: "Bet not found." });
//     }

//     if (bet.status !== "live") {
//       return res.status(400).json({
//         message: "Only LIVE bets can be resolved.",
//       });
//     }

//     // if (new Date() < bet.endAt) {
//     //   return res.status(400).json({
//     //     message: "Bet cannot be resolved before end time.",
//     //   });
//     // }

//     if (!bet.contractAddress) {
//       return res.status(400).json({
//         message: "Bet does not have a contract address.",
//       });
//     }

//     const contract = new ethers.Contract(
//       bet.contractAddress,
//       betEscrowAbi.abi as InterfaceAbi,
//       wallet,
//     );

//     // Extra safety: ensure backend is owner
//     // const owner = await contract.owner();
//     // if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
//     //   return res.status(403).json({
//     //     message: "Backend is not owner of this bet contract.",
//     //   });
//     // }

//     const tx = await contract.getFunction("resolveBet")(winner);
//     const result = await tx.wait();
//     console.log("result", result);

//     // Update DB
//     bet.status = "settled";
//     await bet.save();

//     return res.json({
//       success: true,
//       message: "Bet resolved successfully.",
//       winner: winner === 1 ? "A" : "B",
//     });
//   } catch (error: any) {
//     console.error("Resolve error:", error);
//     return res.status(500).json({
//       message: error.message || "Failed to resolve bet.",
//     });
//   }
// };

// export const claimRewardStatus = async (req: Request, res: Response) => {
//   try {
//     // if (!req.user) {
//     //   return res.status(401).json({ message: "Unauthorized." });
//     // }

//     const { betId } = req.params;

//     const bet = await Bet.findByPk(betId);
//     if (!bet) {
//       return res.status(404).json({ message: "Bet not found." });
//     }

//     if (bet.status !== "settled") {
//       return res.status(400).json({
//         message: "Bet is not settled yet.",
//       });
//     }

//     // const prediction = await BetPrediction.findOne({
//     //   where: {
//     //     betId,
//     //     userId: req.user.id,
//     //   },
//     // });

//     // if (!prediction) {
//     //   return res.status(404).json({
//     //     message: "You did not participate in this bet.",
//     //   });
//     // }

//     if (!bet.contractAddress) {
//       return res.status(400).json({
//         message: "Bet does not have a contract address.",
//       });
//     }

//     const contract = new ethers.Contract(
//       bet.contractAddress,
//       betEscrowAbi.abi as InterfaceAbi,
//       wallet,
//     );
//     const tx = await contract.getFunction("claimReward")();
//     const result = await tx.wait();
//     console.log("result", result);

//     // const winningSide = bet.winner; // assume you store winner in DB if needed

//     // if (prediction.side !== winningSide) {
//     //   return res.status(400).json({
//     //     message: "You are not on the winning side.",
//     //   });
//     // }

//     return res.json({
//       eligible: true,
//       message:
//         "You can claim your reward from the smart contract using your wallet.",
//     });
//   } catch (error: any) {
//     console.error("Claim status error:", error);
//     return res.status(500).json({
//       message: error.message || "Failed to check claim status.",
//     });
//   }
// };
