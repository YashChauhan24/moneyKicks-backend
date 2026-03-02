import { Router } from "express";
import {
  createJackpot,
  listJackpots,
  createJackpotEntry,
  listJackpotEntries,
  checkJackpotEligibility,
  getJackpotParticipantByWallet,
  getJackpotPool,
  selectJackpotWinners,
} from "../controllers/jackpots.controller";

const jackpotRouter = Router();

// Admin: create a jackpot round
jackpotRouter.post("/", createJackpot);

// List jackpots (optionally filter by isActive, currency)
jackpotRouter.get("/", listJackpots);

// Create an entry for a given jackpot
jackpotRouter.post("/:jackpotId/entries", createJackpotEntry);

// List entries for a given jackpot
jackpotRouter.get("/:jackpotId/entries", listJackpotEntries);

// Check eligibility without creating an entry
jackpotRouter.post("/:jackpotId/check-eligibility", checkJackpotEligibility);

// Get participation for a specific wallet in a jackpot
jackpotRouter.get("/:jackpotId/participants/:walletAddress",getJackpotParticipantByWallet);

// Get the total pool for a jackpot (USD + AVAX converted to USD)
jackpotRouter.get("/:jackpotId/pool", getJackpotPool);

// Select 3 random winners and calculate prize distribution
jackpotRouter.post("/:jackpotId/select-winners", selectJackpotWinners);

export default jackpotRouter;
