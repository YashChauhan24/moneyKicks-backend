import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import router from "./routes/routes";
import { initDb } from "./config/database";
import { swaggerSpec } from "./config/swagger";
import { startJackpotWorker } from "./workers/jackpotWorker";
import { startBetSettlementWorker } from "./workers/betSettlementWorker";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(cookieParser());
app.use(express.json());

// Swagger UI
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", message: "API is running" });
});

app.use("/api", router);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const startServer = async () => {
  await initDb();

  // Start the automated background workers
  startJackpotWorker();
  startBetSettlementWorker();

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};

startServer();
