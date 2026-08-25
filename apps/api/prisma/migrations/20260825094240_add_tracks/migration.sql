-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSec" DOUBLE PRECISION,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);
