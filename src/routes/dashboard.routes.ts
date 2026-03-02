import { Router } from "express";
import { getDashboardOverview } from "../controllers/dashboard.controller";

const dashboardRouter = Router();

dashboardRouter.get("/overview", getDashboardOverview);

export default dashboardRouter;
