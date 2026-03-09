import { Router } from "express";
import { createBetInvite } from "../controllers/betInvites.controller";
import { authMiddleware } from "../middleware/auth";

const betInviteRouter = Router();

// Create a bet invite (requires authenticated user)
betInviteRouter.post("/", authMiddleware, createBetInvite);

export default betInviteRouter;
