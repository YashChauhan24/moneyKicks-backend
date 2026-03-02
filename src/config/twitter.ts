import { TwitterApi } from "twitter-api-v2";

const appKey = process.env.TWITTER_APP_KEY;
const appSecret = process.env.TWITTER_APP_SECRET;

if (!appKey || !appSecret) {
  throw new Error(
    "[twitter] TWITTER_APP_KEY and TWITTER_APP_SECRET must be set for OAuth to work.",
  );
}

export const twitterRequestClient = new TwitterApi({
  appKey,
  appSecret,
});
