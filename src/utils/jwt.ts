import jwt from "jsonwebtoken";
import { UserAttributes } from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

interface JwtPayload {
  sub: string;
  twitterId?: string | null;
  twitterUsername?: string | null;
}

export const signUserJwt = (user: Pick<UserAttributes, "id" | "twitterId" | "twitterUsername">) => {
  const payload: JwtPayload = {
    sub: user.id,
    twitterId: user.twitterId ?? null,
    twitterUsername: user.twitterUsername ?? null,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d",
  });
};

export const verifyJwt = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};

