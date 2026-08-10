-- Nhật ký chuyển trạng thái tờ khai.

CREATE TABLE "customs_status_history" (
    "id" TEXT NOT NULL,
    "customsRecordId" TEXT NOT NULL,
    "fromStatus" "CustomsStatus",
    "toStatus" "CustomsStatus" NOT NULL,
    "note" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customs_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customs_status_history_customsRecordId_createdAt_idx"
    ON "customs_status_history"("customsRecordId", "createdAt");

ALTER TABLE "customs_status_history"
    ADD CONSTRAINT "customs_status_history_customsRecordId_fkey"
    FOREIGN KEY ("customsRecordId") REFERENCES "customs_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Xoá người dùng thì giữ lại lịch sử, chỉ bỏ trống người thực hiện: nhật ký duyệt
-- hồ sơ phải tồn tại lâu hơn vòng đời của một tài khoản nhân sự.
ALTER TABLE "customs_status_history"
    ADD CONSTRAINT "customs_status_history_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tờ khai đã có sẵn chưa có dòng lịch sử nào; tạo mốc khởi tạo để dòng thời gian
-- trên giao diện không bắt đầu từ khoảng trống.
INSERT INTO "customs_status_history" ("id", "customsRecordId", "fromStatus", "toStatus", "note", "changedById", "createdAt")
SELECT
    'seed_' || "id",
    "id",
    NULL,
    "status",
    'Dữ liệu trước khi bật nhật ký trạng thái',
    "createdById",
    "createdAt"
FROM "customs_records";
