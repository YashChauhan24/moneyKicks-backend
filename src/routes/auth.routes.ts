import { Router } from "express";
import {
  getTwitterAuthUrl,
  twitterCallback,
} from "../controllers/auth.controller";

const authRouter = Router();

// Step 1: Get Twitter OAuth URL
authRouter.get("/twitter", getTwitterAuthUrl);

// Step 2: Twitter callback URL
authRouter.get("/twitter/callback", twitterCallback);

export default authRouter;

