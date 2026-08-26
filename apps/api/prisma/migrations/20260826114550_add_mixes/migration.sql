/*
  Warnings:

  - Added the required column `updatedAt` to the `Track` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "analysisJson" TEXT,
ADD COLUMN     "bpm" DOUBLE PRECISION,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'uploaded',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "Mix" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled Mix',
    "status" TEXT NOT NULL DEFAULT 'planning',
    "targetBpm" DOUBLE PRECISION,
    "planJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MixTrack" (
    "id" TEXT NOT NULL,
    "mixId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "MixTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MixTrack_mixId_order_idx" ON "MixTrack"("mixId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MixTrack_mixId_trackId_key" ON "MixTrack"("mixId", "trackId");

-- AddForeignKey
ALTER TABLE "MixTrack" ADD CONSTRAINT "MixTrack_mixId_fkey" FOREIGN KEY ("mixId") REFERENCES "Mix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixTrack" ADD CONSTRAINT "MixTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
