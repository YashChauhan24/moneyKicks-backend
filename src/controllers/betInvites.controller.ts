import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { BetInvite } from "../models/BetInvite";

interface CreateBetInviteBody {
  inviteeTwitterUsername: string;
  message?: string;
}

export const createBetInvite = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { inviteeTwitterUsername, message } =
      req.body as CreateBetInviteBody;

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

    const invite = await BetInvite.create({
      inviterUserId: req.user.id,
      inviteeTwitterUsername,
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

