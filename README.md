# moneyKicks Backend

Backend service for the moneyKicks social betting and jackpot platform. The project is a TypeScript + Express monolith backed by postgreSQL via Sequelize, with Twitter/X OAuth login, JWT-protected routes, jackpot and bet lifecycle management, and background workers for settlement and prize distribution.

## What It Does

- Authenticates users with Twitter/X OAuth 1.0a
- Issues JWTs for protected API access
- Creates and manages bets, predictions, invites, and winner selection
- Records transfers as the internal ledger for business events and payouts
- Creates jackpot rounds, validates eligibility, stores entries, and resolves winners
- Runs in-process workers for weekly jackpot processing and bet settlement
- Optionally performs on-chain AVAX payouts through a configured wallet
- Exposes Swagger API docs and a health endpoint

## Tech Stack

- Runtime: Node.js, TypeScript, Express 5
- Database: postgreSQL
- ORM: Sequelize
- Auth: Twitter/X OAuth, JWT
- Jobs: `node-cron`
- API Docs: Swagger UI + `swagger-jsdoc`
- Web3: `viem`, `@wagmi/core`, `ethers`
- Contracts workspace: Hardhat + Solidity

## Project Structure

```text
src/
  config/         Database, Swagger, Twitter config
  controllers/    Request handlers
  middleware/     Auth middleware
  models/         Sequelize models
  routes/         API route modules
  utils/          JWT, web3, jackpot helpers
  workers/        Jackpot and bet settlement cron workers
contracts/        Solidity contracts and compiled artifacts
TECHNICAL_DOCUMENTATION.md
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the required values.

```bash
cp .env.example .env
```

### 3. Start PostgreSQL

Create a PostgreSQL database matching `DB_NAME` and ensure the configured user can connect to it.

### 4. Run the backend

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

The API defaults to `http://localhost:4000`.

## Available Scripts

- `npm run dev` starts the TypeScript server with hot reload
- `npm run build` compiles to `dist/`
- `npm start` runs the compiled server from `dist/index.js`

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP server port, defaults to `4000` |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port |
| `DB_USER` | Yes | PostgreSQL username |
| `DB_PASSWORD` | Yes | PostgreSQL password |
| `DB_NAME` | Yes | PostgreSQL database name |
| `DB_LOGGING` | No | Intended DB logging toggle |
| `JWT_SECRET` | Yes | Secret used to sign auth tokens |
| `TWITTER_APP_KEY` | Yes | Twitter/X app key |
| `TWITTER_APP_SECRET` | Yes | Twitter/X app secret |
| `TWITTER_CALLBACK_URL` | Yes | OAuth callback URL |
| `AVAX_USD_RATE` | No | Optional fallback AVAX/USD rate |
| `BETTING_FACTORY_ADDRESS` | No | Betting contract/factory address |
| `PRIVATE_KEY` | Required for payouts | Treasury wallet private key |
| `RPC_URL` | Required for payouts | Avalanche RPC URL |
| `CHAIN_ID` | No | Explicit chain ID override for RPC validation |
| `BET_EVALUATOR_URL` | No | External evaluator endpoint for bet auto-resolution |
| `BET_EVALUATOR_TIMEOUT_MS` | No | Timeout for evaluator requests |
| `BET_AUTO_EVALUATION_ENABLED` | No | Enables auto winner selection in the settlement worker |
| `BET_PAYOUTS_ONCHAIN_ENABLED` | No | Enables on-chain payout execution |

## API Surface

Base path: `/api`

### Auth

- `GET /auth/twitter` generate the Twitter/X auth URL
- `GET /auth/twitter/callback` exchange verifier for user login and JWT
- `PATCH /auth/me/wallet` update the authenticated user wallet address

### Bets

- `POST /bets` create a bet
- `GET /bets` list bets
- `GET /bets/:betId` get bet details
- `POST /bets/:betId/predictions` create a prediction
- `POST /bets/:betId/accept-invite` accept a bet invite
- `POST /bets/:betId/pick-winner` manually pick the winner

### Bet Invites

- `POST /bet-invites` create a bet invite

### Jackpots

- `POST /jackpots` create a jackpot round
- `GET /jackpots` list jackpots
- `POST /jackpots/:jackpotId/entries` create a jackpot entry
- `GET /jackpots/:jackpotId/entries` list jackpot entries
- `POST /jackpots/:jackpotId/check-eligibility` validate jackpot eligibility
- `GET /jackpots/:jackpotId/participants/:walletAddress` get jackpot participation for a wallet
- `GET /jackpots/:jackpotId/pool` get jackpot pool totals
- `POST /jackpots/:jackpotId/select-winners` select winners
- `POST /jackpots/manual/resolve` manually trigger jackpot resolution
- `POST /jackpots/manual/create-weekly` manually create the weekly jackpot

### Transfers

- `POST /transfers` record a transfer
- `GET /transfers` list transfers
- `GET /transfers/:id` fetch a transfer by ID

### Dashboard

- `GET /dashboard/overview` fetch aggregated dashboard data

### Operational

- `GET /health` health check
- `GET /docs` Swagger UI

## Authentication

Protected routes expect:

```http
Authorization: Bearer <jwt>
```

JWTs are issued after a successful Twitter/X OAuth callback.

## Background Workers

The server starts both workers automatically from `src/index.ts`.

- `jackpotWorker`
  - currently scheduled every 10 minutes
  - resolves ended jackpots
  - creates the next weekly jackpot when needed
  - can send AVAX payouts to selected winners
- `betSettlementWorker`
  - settles eligible bets
  - can auto-select winners through an evaluator service
  - can execute on-chain payouts when enabled

## Smart Contracts

The repository also includes a Hardhat workspace:

- `contracts/BetEscrow.sol`
- `contracts/BettingFactory.sol`
- `compile.js`
- `deploy.js`
- `hardhat.config.js`

This backend is still primarily database-first. The Solidity workspace exists for contract-based flows and future expansion.

## Database Behavior

On startup, the app authenticates against PostgreSQL and runs:

```ts
sequelize.sync({ alter: true })
```

This is convenient for development but is not ideal for production-grade schema management. Migration-based workflows are the safer next step.

## Current Operational Caveats

- OAuth request token secrets are stored in an in-memory `Map`, so pending login sessions are not durable across restarts
- Schema changes currently rely on `sequelize.sync({ alter: true })` instead of explicit migrations
- Workers are in-process cron jobs, so duplicate-processing protections should be strengthened before horizontal scaling
- The default `test` script is a placeholder; automated coverage is still limited
