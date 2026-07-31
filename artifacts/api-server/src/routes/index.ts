import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scanRouter from "./scan";
import adminRouter from "./admin";
import geocodeRouter from "./geocode";
import catalogueImportRouter from "./catalogue-import";
import marketValueRouter from "./market-value";
import ebayDeletionRouter from "./ebay-deletion";
import ebayImageDryRunRouter from "./ebay-image-dryrun";
import catalogueValidationRouter from "./catalogue-validation";
import visionTestRouter from "./vision-test";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(adminRouter);
router.use(geocodeRouter);
router.use(catalogueImportRouter);
router.use(marketValueRouter);
router.use(ebayDeletionRouter);
router.use(ebayImageDryRunRouter);
router.use(catalogueValidationRouter);
router.use(visionTestRouter);

export default router;
