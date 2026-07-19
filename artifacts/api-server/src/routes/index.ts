import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scanRouter from "./scan";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(adminRouter);

export default router;
