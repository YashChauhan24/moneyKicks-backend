import { Router } from "express";
import {
  getTwitterAuthUrl,
  twitterCallback,
  updateMyWalletAddress,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth";

const authRouter = Router();

// Step 1: Get Twitter OAuth URL
authRouter.get("/twitter", getTwitterAuthUrl);

// Step 2: Twitter callback URL
authRouter.get("/twitter/callback", twitterCallback);

// Update authenticated user's payout wallet address
authRouter.patch("/me/wallet", authMiddleware, updateMyWalletAddress);

export default authRouter;
