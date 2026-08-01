-- Make leg1Origin and leg1Destination nullable for backward compatibility
ALTER TABLE "customs_records" ALTER COLUMN "leg1Origin" DROP NOT NULL;
ALTER TABLE "customs_records" ALTER COLUMN "leg1Destination" DROP NOT NULL;

-- Create journeys table
CREATE TABLE "journeys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customsRecordId" TEXT NOT NULL,
    "legNumber" INTEGER NOT NULL,
    "transportType" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "journeys_customsRecordId_fkey" FOREIGN KEY ("customsRecordId") REFERENCES "customs_records" ("id") ON DELETE CASCADE
);

-- Create unique constraint on (customsRecordId, legNumber)
CREATE UNIQUE INDEX "journeys_customsRecordId_legNumber_key" ON "journeys"("customsRecordId", "legNumber");

-- Create index for faster queries
CREATE INDEX "journeys_customsRecordId_idx" ON "journeys"("customsRecordId");
