import { Router } from "express";
import transferRoutes from "./transfer.routes";
import jackpotRoutes from "./jackpot.routes";
import authRoutes from "./auth.routes";
import betInviteRoutes from "./betInvite.routes";
import betRoutes from "./bet.routes";
import dashboardRouter from "./dashboard.routes";

const router = Router();

router.use("/transfers", transferRoutes);
router.use("/jackpots", jackpotRoutes);
router.use("/auth", authRoutes);
router.use("/bet-invites", betInviteRoutes);
router.use("/bets", betRoutes);
router.use("/dashboard", dashboardRouter);

export default router;
