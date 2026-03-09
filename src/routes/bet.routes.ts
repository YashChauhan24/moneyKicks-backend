import { Router } from "express";
import {
  createBet,
  listBets,
  getBetById,
  createBetPrediction,
  acceptBetInvite,
  pickBetWinner,
} from "../controllers/bets.controller";
import { authMiddleware } from "../middleware/auth";

const betRouter = Router();

// Create a new bet (requires authentication)
betRouter.post("/", authMiddleware, createBet);

// List bets with optional status filter
betRouter.get("/", listBets);

// Get details for a specific bet, including aggregate stats
betRouter.get("/:betId", getBetById);

// Place a prediction on a bet (requires authentication)
betRouter.post("/:betId/predictions", authMiddleware, createBetPrediction);

// Accept a bet invite link (requires authentication)
betRouter.post("/:betId/accept-invite", authMiddleware, acceptBetInvite);

// Pick winner for a bet (requires authentication and creator ownership)
betRouter.post("/:betId/pick-winner", authMiddleware, pickBetWinner);

// betRouter.post("/:betId/claim", claimRewardStatus);

export default betRouter;
