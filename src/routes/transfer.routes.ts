// src/routes/transferRoutes.ts
import { Router } from "express";
import { createTransfer, getTransferById, getTransfersList } from "../controllers/transfers.controller";

const transferRouter = Router();


/**
 * POST /api/transfers
 * Records a new transfer (already executed via core wallet on frontend).
 */
transferRouter.post("/", createTransfer);

/**
 * GET /api/transfers/:id
 * Fetch a single transfer by id.
 */
transferRouter.get("/:id", getTransferById);

/**
 * GET /api/transfers
 * Optional: list transfers (basic pagination).
 */
transferRouter.get("/", getTransfersList);

export default transferRouter;
