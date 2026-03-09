import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { BetInvite } from "../models/BetInvite";
import { Bet } from "../models/Bet";

interface CreateBetInviteBody {
  betId: string;
  inviteeTwitterUsername: string;
  message?: string;
}

const normalizeTwitterUsername = (value: string) =>
  value.trim().replace(/^@/, "").toLowerCase();

export const createBetInvite = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { betId, inviteeTwitterUsername, message } =
      req.body as CreateBetInviteBody;

    if (!betId || typeof betId !== "string") {
      return res.status(400).json({
        message: "betId is required and must be a string.",
      });
    }

    if (
      !inviteeTwitterUsername ||
      typeof inviteeTwitterUsername !== "string"
    ) {
      return res.status(400).json({
        message:
          "inviteeTwitterUsername is required and must be a string.",
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const bet = await Bet.findByPk(betId);
    if (!bet) {
      return res.status(404).json({ message: "Bet not found." });
    }

    if (bet.createdByUserId !== req.user.id) {
      return res.status(403).json({
        message: "Only the bet creator can send an invite for this bet.",
      });
    }

    if (bet.status !== "pending") {
      return res.status(400).json({
        message: "Invites can only be sent while the bet is pending.",
      });
    }

    if (bet.opponentUserId) {
      return res.status(400).json({
        message: "This bet already has an opponent.",
      });
    }

    const normalizedUsername = normalizeTwitterUsername(inviteeTwitterUsername);

    const existingPendingInvite = await BetInvite.findOne({
      where: {
        betId,
        inviteeTwitterUsername: normalizedUsername,
        status: "PENDING",
      },
    });

    if (existingPendingInvite) {
      return res.status(409).json({
        message: "A pending invite already exists for this user on this bet.",
      });
    }

    const invite = await BetInvite.create({
      betId,
      inviterUserId: req.user.id,
      inviteeTwitterUsername: normalizedUsername,
      message: message ?? null,
    });

    return res.status(201).json({
      message: "Bet invite created successfully.",
      data: invite,
    });
  } catch (error) {
    next(error);
  }
};
