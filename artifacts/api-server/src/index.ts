import app from "./app";
import { logger } from "./lib/logger";
import { recoverOrphanedImportBatches } from "./routes/catalogue-import";
import { startDraftCleanup } from "./services/contributed-drafts-cleanup";
import { startAutoResume } from "./services/pictureIndex/indexer";
import { pictureIndexConfigured } from "./services/pictureIndex/vertex";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Recover import batches orphaned by a previous restart/crash
  void recoverOrphanedImportBatches().catch((err) => {
    logger.error({ err }, "Import batch recovery failed");
  });

  // Delete contribution previews nobody submitted, after 24 hours.
  startDraftCleanup(logger);

  // Picture index: carry on an unfinished build after a restart, and top up daily
  // (only with PICTURE_INDEX_AUTO_RESUME=true).
  startAutoResume(logger, { configured: () => pictureIndexConfigured() });
});
