-- Gắn công việc vào tờ khai, và cho thông báo mang theo đường dẫn điều hướng.

ALTER TABLE "notifications" ADD COLUMN "link" TEXT;

ALTER TABLE "tasks" ADD COLUMN "customsRecordId" TEXT;

CREATE INDEX "tasks_customsRecordId_idx" ON "tasks"("customsRecordId");

-- Xoá tờ khai thì giữ lại công việc, chỉ gỡ liên kết: bản ghi chấm công của nhân
-- viên không nên biến mất theo hồ sơ mà họ từng xử lý.
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_customsRecordId_fkey"
    FOREIGN KEY ("customsRecordId") REFERENCES "customs_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
