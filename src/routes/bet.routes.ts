import { Router } from "express";
import {
  createBet,
  listBets,
  getBetById,
  createBetPrediction,
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

export default betRouter;

