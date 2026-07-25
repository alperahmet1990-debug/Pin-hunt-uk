import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scanRouter from "./scan";
import adminRouter from "./admin";
import geocodeRouter from "./geocode";
import catalogueImportRouter from "./catalogue-import";
import marketValueRouter from "./market-value";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(adminRouter);
router.use(geocodeRouter);
router.use(catalogueImportRouter);
router.use(marketValueRouter);

export default router;
