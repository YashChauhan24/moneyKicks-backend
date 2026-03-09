import { Request, Response, NextFunction } from "express";
import { TwitterApi } from "twitter-api-v2";
import { isAddress } from "viem";
import { twitterRequestClient } from "../config/twitter";
import { User } from "../models/User";
import { signUserJwt } from "../utils/jwt";
import { AuthenticatedRequest } from "../middleware/auth";

const oauthTokenSecrets = new Map<string, string>();

interface UpdateWalletBody {
  walletAddress: string;
}

export const getTwitterAuthUrl = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const callbackUrl = process.env.TWITTER_CALLBACK_URL;

    if (!callbackUrl) {
      return res.status(500).json({
        message: "Twitter callback URL is not configured on the server.",
      });
    }

    const { url, oauth_token, oauth_token_secret } =
      await twitterRequestClient.generateAuthLink(callbackUrl);

    if (oauth_token && oauth_token_secret) {
      oauthTokenSecrets.set(oauth_token, oauth_token_secret);
    }

    return res.json({ url });
  } catch (error) {
    next(error);
  }
};

export const twitterCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { oauth_token, oauth_verifier } = req.query;

    if (typeof oauth_token !== "string" || typeof oauth_verifier !== "string") {
      return res.status(400).json({
        message: "Missing oauth_token or oauth_verifier in callback.",
      });
    }

    const oauthTokenSecret = oauthTokenSecrets.get(oauth_token);
    if (!oauthTokenSecret) {
      return res.status(400).json({
        message: "Unknown or expired OAuth request token.",
      });
    }

    oauthTokenSecrets.delete(oauth_token);

    const appKey = process.env.TWITTER_APP_KEY || "";
    const appSecret = process.env.TWITTER_APP_SECRET || "";

    const requestClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken: oauth_token,
      accessSecret: oauthTokenSecret,
    });

    const {
      client: userClient,
      accessToken,
      accessSecret,
      userId,
      screenName,
    } = await requestClient.login(oauth_verifier);

    const me = await userClient.v2.me({
      "user.fields": ["name", "profile_image_url", "username"],
    } as any);

    const meData = (me as any).data ?? {};

    const twitterId = userId;
    const twitterUsername = meData.username ?? screenName ?? null;
    const twitterName = meData.name ?? null;
    const twitterAvatar = meData.profile_image_url ?? null;

    let user = await User.findOne({ where: { twitterId } });

    if (!user) {
      user = await User.create({
        twitterId,
        twitterUsername,
        twitterName,
        twitterAvatar,
        twitterAccessToken: accessToken,
        twitterRefreshToken: accessSecret,
      });
    } else {
      await user.update({
        twitterUsername,
        twitterName,
        twitterAvatar,
        twitterAccessToken: accessToken,
        twitterRefreshToken: accessSecret,
      });
    }

    const token = signUserJwt({
      id: user.id,
      twitterId: user.twitterId,
      twitterUsername: user.twitterUsername,
    });

    return res.json({
      message: "Twitter login successful.",
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const updateMyWalletAddress = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { walletAddress: rawWalletAddress } = req.body as UpdateWalletBody;
    const walletAddress = rawWalletAddress?.trim();
    if (!walletAddress) {
      return res.status(400).json({ message: "walletAddress is required." });
    }

    if (!isAddress(walletAddress)) {
      return res.status(400).json({ message: "walletAddress is invalid." });
    }

    const existingUser = await User.findOne({
      where: { walletAddress },
    });

    if (existingUser && existingUser.id !== req.user.id) {
      return res.status(409).json({
        message: "This wallet address is already linked to another user.",
      });
    }

    await req.user.update({ walletAddress });

    return res.json({
      message: "Wallet address updated successfully.",
      data: req.user,
    });
  } catch (error) {
    next(error);
  }
};
