import { NextFunction, Request, Response } from "express";
import { verifyJwt } from "../utils/jwt";
import { User } from "../models/User";

export interface AuthenticatedRequest extends Request {
  user?: User;
  userId?: string;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Missing or invalid Authorization header." });
    }

    const token = header.slice("Bearer ".length).trim();

    let payload;
    try {
      payload = verifyJwt(token);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }

    const userId = payload.sub;
    if (!userId) {
      return res.status(401).json({ message: "Invalid token payload." });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    req.user = user;
    req.userId = user.id;

    return next();
  } catch (error) {
    return next(error);
  }
};

