-- Danh mục mã HS dùng chung, thay cho mảng gợi ý cứng trong mã nguồn frontend.
CREATE TABLE "hs_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultUnit" TEXT,
    "vatRate" DOUBLE PRECISION,
    "notes" TEXT,
    "autoCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "hs_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hs_codes_code_key" ON "hs_codes"("code");
CREATE INDEX "hs_codes_description_idx" ON "hs_codes"("description");

ALTER TABLE "hs_codes" ADD CONSTRAINT "hs_codes_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Thuế nhập khẩu tách riêng khỏi VAT, và tổng trọng lượng để tính phí vận chuyển.
ALTER TABLE "customs_records" ADD COLUMN "importDutyRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "customs_records" ADD COLUMN "importDutyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "customs_records" ADD COLUMN "totalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Điền tổng trọng lượng cho các tờ khai đã có, từ chính các dòng vật tư của nó.
UPDATE "customs_records" r
SET "totalWeight" = COALESCE((
    SELECT SUM(COALESCE(m."weight", 0)) FROM "materials" m WHERE m."customsRecordId" = r."id"
), 0);
