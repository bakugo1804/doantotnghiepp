-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DIRECTOR';

-- AlterTable
ALTER TABLE "customs_records" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 25000,
ADD COLUMN     "exporterCountry" TEXT NOT NULL DEFAULT 'VN',
ADD COLUMN     "importerCountry" TEXT NOT NULL DEFAULT 'VN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_externalId_key" ON "notifications"("externalId");

-- CreateIndex
CREATE INDEX "notifications_userId_receivedAt_idx" ON "notifications"("userId", "receivedAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_records" ADD CONSTRAINT "customs_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
