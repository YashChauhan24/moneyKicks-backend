// src/config/database.ts
import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

/**
 * Central Sequelize instance for the whole app.
 * Uses MySQL as the dialect.
 */
export const sequelize = new Sequelize(
  process.env.DB_NAME as string,
  process.env.DB_USER as string,
  process.env.DB_PASSWORD,
  {
    host: (process.env.DB_HOST as string) || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    dialect: "mysql",
    logging: process.env.DB_LOGGING === "true" ? console.log : false,
  }
);

/**
 * Initialize database connection and sync models.
 * Call this once before starting the HTTP server.
 */
export const initDb = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to MySQL");

    // Sync models – in production you may want migrations instead
    await sequelize.sync({ alter: true });
    console.log("✅ Database synced");
  } catch (error) {
    console.error("❌ Unable to connect to the database:", error);
    process.exit(1); // Fail fast if DB is not available
  }
};
