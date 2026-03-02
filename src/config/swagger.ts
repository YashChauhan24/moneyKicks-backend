import swaggerJsdoc from "swagger-jsdoc";
import path from "path";

const version = process.env.npm_package_version || "1.0.0";

/**
 * Swagger / OpenAPI specification for the API.
 * This uses swagger-jsdoc to generate the spec from this object +
 * any JSDoc annotations you may add later.
 */
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "moneyKicks-backend API",
      version,
      description:
        "API for recording USD and AVAX transfers executed via core wallets.",
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Local server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Transfer: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            fromWallet: { type: "string" },
            toWallet: { type: "string" },
            amount: { type: "string", description: "Decimal amount" },
            currency: {
              type: "string",
              enum: ["USD", "AVAX"],
            },
            txHash: { type: "string", nullable: true },
            network: { type: "string", nullable: true },
            jackpotId: { type: "string", format: "uuid", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["id", "fromWallet", "toWallet", "amount", "currency"],
        },
        CreateTransferRequest: {
          type: "object",
          properties: {
            fromWallet: { type: "string" },
            toWallet: { type: "string" },
            amount: {
              oneOf: [{ type: "number" }, { type: "string" }],
              description: "Positive amount (number or string)",
            },
            currency: {
              type: "string",
              enum: ["USD", "AVAX"],
            },
            txHash: { type: "string" },
            network: { type: "string" },
            jackpotId: {
              type: "string",
              format: "uuid",
              description:
                "Optional jackpot ID; if provided, this transfer counts as participation in that jackpot for the fromWallet.",
            },
          },
          required: ["fromWallet", "toWallet", "amount", "currency"],
        },
        Jackpot: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            startAt: { type: "string", format: "date-time" },
            endAt: { type: "string", format: "date-time" },
            minAmount: { type: "string" },
            currency: { type: "string", enum: ["USD", "AVAX", "BOTH"] },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: [
            "id",
            "name",
            "startAt",
            "endAt",
            "minAmount",
            "currency",
            "isActive",
          ],
        },
        JackpotEntry: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            jackpotId: { type: "string", format: "uuid" },
            walletAddress: { type: "string" },
            transferId: { type: "string", format: "uuid" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["id", "jackpotId", "walletAddress", "transferId"],
        },
        CreateJackpotRequest: {
          type: "object",
          properties: {
            name: { type: "string" },
            startAt: { type: "string", format: "date-time" },
            endAt: { type: "string", format: "date-time" },
            minAmount: {
              oneOf: [{ type: "number" }, { type: "string" }],
            },
            currency: { type: "string", enum: ["USD", "AVAX", "BOTH"] },
            isActive: { type: "boolean" },
          },
          required: ["name", "startAt", "endAt", "minAmount", "currency"],
        },
        CreateJackpotEntryRequest: {
          type: "object",
          properties: {
            walletAddress: { type: "string" },
            transferId: { type: "string", format: "uuid" },
          },
          required: ["walletAddress", "transferId"],
        },
        JackpotPoolResponse: {
          type: "object",
          properties: {
            jackpotId: { type: "string", format: "uuid" },
            jackpotName: { type: "string" },
            participantCount: { type: "integer" },
            totalPoolUSD: { type: "number" },
            breakdown: {
              type: "object",
              properties: {
                usdEntries: { type: "number" },
                avaxEntries: { type: "number" },
                avaxToUSD: { type: "number" },
                avaxRate: { type: "number" },
              },
            },
            prizeDistribution: {
              type: "object",
              properties: {
                totalPool: { type: "number" },
                platformFee: { type: "number" },
                platformFeePercentage: { type: "number" },
                remainingAfterFee: { type: "number" },
                winners: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      place: { type: "integer", enum: [1, 2, 3] },
                      percentage: { type: "number" },
                      amountUSD: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
        Winner: {
          type: "object",
          properties: {
            place: { type: "integer", enum: [1, 2, 3] },
            walletAddress: { type: "string" },
            prizeUSD: { type: "number" },
            percentage: { type: "number" },
          },
        },
        WinnerSelectionResponse: {
          type: "object",
          properties: {
            jackpotId: { type: "string", format: "uuid" },
            jackpotName: { type: "string" },
            participantCount: { type: "integer" },
            poolSummary: {
              type: "object",
              properties: {
                totalPoolUSD: { type: "number" },
                breakdown: {
                  type: "object",
                  properties: {
                    usdEntries: { type: "number" },
                    avaxEntries: { type: "number" },
                    avaxToUSD: { type: "number" },
                    avaxRate: { type: "number" },
                  },
                },
              },
            },
            prizeDistribution: {
              type: "object",
              properties: {
                totalPool: { type: "number" },
                platformFee: { type: "number" },
                remainingAfterFee: { type: "number" },
                prizePercentages: {
                  type: "object",
                  properties: {
                    first: { type: "number" },
                    second: { type: "number" },
                    third: { type: "number" },
                  },
                },
              },
            },
            winners: {
              type: "array",
              items: { $ref: "#/components/schemas/Winner" },
            },
          },
        },
        BetInvite: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            inviterUserId: { type: "string", format: "uuid" },
            inviteeTwitterUsername: { type: "string" },
            message: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"],
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["id", "inviterUserId", "inviteeTwitterUsername", "status"],
        },
        CreateBetInviteRequest: {
          type: "object",
          properties: {
            inviteeTwitterUsername: { type: "string" },
            message: { type: "string" },
          },
          required: ["inviteeTwitterUsername"],
        },
        Bet: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string" },
            competitorAName: { type: "string" },
            competitorBName: { type: "string" },
            endCondition: { type: "string" },
            stakeAmount: { type: "string" },
            currency: { type: "string" },
            status: {
              type: "string",
              enum: ["PENDING", "LIVE", "SETTLED"],
            },
            startAt: { type: "string", format: "date-time" },
            endAt: { type: "string", format: "date-time" },
            createdByUserId: { type: "string", format: "uuid" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: [
            "id",
            "title",
            "description",
            "competitorAName",
            "competitorBName",
            "endCondition",
            "stakeAmount",
            "currency",
            "status",
            "startAt",
            "endAt",
            "createdByUserId",
          ],
        },
        BetStats: {
          type: "object",
          properties: {
            predictorCount: { type: "integer" },
            totalPool: { type: "string" },
            totalOnA: { type: "string" },
            totalOnB: { type: "string" },
          },
        },
        BetWithStats: {
          allOf: [
            { $ref: "#/components/schemas/Bet" },
            {
              type: "object",
              properties: {
                stats: { $ref: "#/components/schemas/BetStats" },
              },
            },
          ],
        },
        CreateBetRequest: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            competitorAName: { type: "string" },
            competitorBName: { type: "string" },
            endCondition: { type: "string" },
            stakeAmount: {
              oneOf: [{ type: "number" }, { type: "string" }],
            },
            currency: { type: "string" },
            endAt: { type: "string", format: "date-time" },
            status: {
              type: "string",
              enum: ["PENDING", "LIVE", "SETTLED"],
            },
            startAt: { type: "string", format: "date-time" },
          },
          required: [
            "title",
            "description",
            "competitorAName",
            "competitorBName",
            "endCondition",
            "stakeAmount",
            "currency",
            "endAt",
          ],
        },
        BetPrediction: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            betId: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            side: { type: "string", enum: ["A", "B"] },
            amount: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["id", "betId", "userId", "side", "amount"],
        },
        CreateBetPredictionRequest: {
          type: "object",
          properties: {
            side: { type: "string", enum: ["A", "B"] },
            amount: {
              oneOf: [{ type: "number" }, { type: "string" }],
            },
          },
          required: ["side", "amount"],
        },
      },
    },
    paths: {
      "/api/auth/twitter": {
        get: {
          summary: "Get Twitter OAuth URL",
          description:
            "Returns the URL that the frontend should redirect the user to in order to start Twitter OAuth 1.0a login.",
          tags: ["Auth"],
          responses: {
            "200": {
              description: "Twitter OAuth URL generated.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Twitter callback URL not configured or other error.",
            },
          },
        },
      },
      "/api/auth/twitter/callback": {
        get: {
          summary: "Twitter OAuth callback",
          description:
            "Callback endpoint that Twitter redirects to after the user authorizes the app. Exchanges tokens, persists/updates the user, and returns a JWT.",
          tags: ["Auth"],
          parameters: [
            {
              name: "oauth_token",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "oauth_verifier",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "state",
              in: "query",
              required: true,
              schema: { type: "string" },
              description:
                "Opaque state value bound to an HTTP-only cookie for CSRF protection.",
            },
          ],
          responses: {
            "200": {
              description: "Login successful, JWT and user returned.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      token: { type: "string" },
                      user: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid or expired OAuth callback parameters.",
            },
          },
        },
      },
      "/api/transfers": {
        post: {
          summary: "Record a new transfer",
          description:
            "Stores information about a USD or AVAX transfer that was already executed via the core wallet on the frontend.",
          tags: ["Transfers"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateTransferRequest",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Transfer recorded successfully.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/Transfer" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid payload.",
            },
            "500": {
              description: "Internal server error.",
            },
          },
        },
        get: {
          summary: "List transfers",
          description: "Returns a paginated list of recorded transfers.",
          tags: ["Transfers"],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", default: 20 },
            },
            {
              name: "offset",
              in: "query",
              required: false,
              schema: { type: "integer", default: 0 },
            },
          ],
          responses: {
            "200": {
              description: "List of transfers.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Transfer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/transfers/{id}": {
        get: {
          summary: "Get transfer by id",
          tags: ["Transfers"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Transfer found.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { $ref: "#/components/schemas/Transfer" },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Transfer not found.",
            },
          },
        },
      },
      "/api/jackpots": {
        post: {
          summary: "Create a jackpot",
          description: "Create a weekly jackpot with rules and time window.",
          tags: ["Jackpots"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateJackpotRequest",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Jackpot created.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/Jackpot" },
                    },
                  },
                },
              },
            },
          },
        },
        get: {
          summary: "List jackpots",
          tags: ["Jackpots"],
          parameters: [
            {
              name: "isActive",
              in: "query",
              schema: { type: "boolean" },
            },
            {
              name: "currency",
              in: "query",
              schema: { type: "string", enum: ["USD", "AVAX", "BOTH"] },
            },
          ],
          responses: {
            "200": {
              description: "List of jackpots.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Jackpot" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/jackpots/{jackpotId}/entries": {
        post: {
          summary: "Create a jackpot entry",
          description:
            "Enter a jackpot round by linking a qualifying transfer to a wallet address.",
          tags: ["Jackpots"],
          parameters: [
            {
              name: "jackpotId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateJackpotEntryRequest",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Entry created.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/JackpotEntry" },
                    },
                  },
                },
              },
            },
            "400": { description: "Invalid or ineligible entry." },
          },
        },
        get: {
          summary: "List jackpot entries",
          tags: ["Jackpots"],
          parameters: [
            {
              name: "jackpotId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 50 },
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
          ],
          responses: {
            "200": {
              description: "List of entries.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/JackpotEntry" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/jackpots/{jackpotId}/check-eligibility": {
        post: {
          summary: "Check jackpot eligibility",
          tags: ["Jackpots"],
          parameters: [
            {
              name: "jackpotId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateJackpotEntryRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Eligibility result.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      eligible: { type: "boolean" },
                      reasons: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/jackpots/{jackpotId}/participants/{walletAddress}": {
        get: {
          summary: "Get jackpot participation for a wallet",
          tags: ["Jackpots"],
          parameters: [
            {
              name: "jackpotId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "walletAddress",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description:
                "Participation entry for the wallet in the given jackpot.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { $ref: "#/components/schemas/JackpotEntry" },
                    },
                  },
                },
              },
            },
            "404": {
              description:
                "No participation found for this wallet in the jackpot.",
            },
          },
        },
      },
      "/api/jackpots/{jackpotId}/pool": {
        get: {
          summary: "Get jackpot pool information",
          description:
            "Calculates and returns the total prize pool in USD for a jackpot by aggregating all participant entries (USD + AVAX converted to USD).",
          tags: ["Jackpots"],
          parameters: [
            {
              name: "jackpotId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Jackpot pool information.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        $ref: "#/components/schemas/JackpotPoolResponse",
                      },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Jackpot not found.",
            },
          },
        },
      },
      "/api/jackpots/{jackpotId}/select-winners": {
        post: {
          summary: "Select 3 random winners and calculate prize distribution",
          description:
            "Selects 3 random winners from all jackpot participants and calculates their prizes. Platform fee is 5%, and prizes are distributed as: 1st=47.5%, 2nd=28.5%, 3rd=19% of remaining pool.",
          tags: ["Jackpots"],
          parameters: [
            {
              name: "jackpotId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description:
                "Winners selected and prize distribution calculated.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        $ref: "#/components/schemas/WinnerSelectionResponse",
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description:
                "Jackpot has fewer than 3 participants, cannot select winners.",
            },
            "404": {
              description: "Jackpot not found.",
            },
          },
        },
      },
      "/api/bet-invites": {
        post: {
          summary: "Create a bet invite",
          description:
            "Creates a bet invite from the authenticated user (inviter) to another Twitter username.",
          tags: ["BetInvites"],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateBetInviteRequest",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Bet invite created.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/BetInvite" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid bet invite payload.",
            },
            "401": {
              description: "Missing or invalid authentication token.",
            },
          },
        },
      },
      "/api/bets": {
        post: {
          summary: "Create a new bet",
          description:
            "Creates a new A vs B bet with description, end condition, and minimum stake amount.",
          tags: ["Bets"],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateBetRequest",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Bet created successfully.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/Bet" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid bet payload.",
            },
            "401": {
              description: "Missing or invalid authentication token.",
            },
          },
        },
        get: {
          summary: "List bets",
          description:
            "Returns a list of bets with aggregate statistics (prediction counts and pools).",
          tags: ["Bets"],
          parameters: [
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: ["PENDING", "LIVE", "SETTLED"],
              },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20 },
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
          ],
          responses: {
            "200": {
              description: "List of bets.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/BetWithStats",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/bets/{betId}": {
        get: {
          summary: "Get bet by id",
          description:
            "Returns details for a specific bet along with aggregate statistics, used when making a prediction.",
          tags: ["Bets"],
          parameters: [
            {
              name: "betId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Bet found.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        $ref: "#/components/schemas/BetWithStats",
                      },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Bet not found.",
            },
          },
        },
      },
      "/api/bets/{betId}/predictions": {
        post: {
          summary: "Create a prediction for a bet",
          description:
            "Places a prediction on competitor A or B for a specific bet.",
          tags: ["Bets"],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: "betId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateBetPredictionRequest",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Prediction created.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      data: {
                        $ref: "#/components/schemas/BetPrediction",
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid prediction payload or bet not live.",
            },
            "401": {
              description: "Missing or invalid authentication token.",
            },
            "404": {
              description: "Bet not found.",
            },
          },
        },
      },
      "/health": {
        get: {
          summary: "Health check",
          tags: ["System"],
          responses: {
            "200": {
              description: "API is healthy.",
            },
          },
        },
      },
    },
  },
  // No file globs yet; we define everything in `definition`.
  apis: [path.join(__dirname, "../routes/**/*.ts")],
});
