-- Thêm tên đăng nhập và mốc đăng nhập gần nhất cho người dùng.
--
-- Cột username phải là NOT NULL + UNIQUE, nhưng bảng đang có sẵn dữ liệu, nên
-- không thể thêm thẳng ràng buộc. Trình tự: thêm cột cho phép NULL -> điền giá
-- trị suy ra từ email -> khử trùng lặp -> mới siết ràng buộc.

ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Lấy phần trước dấu @ của email, bỏ mọi ký tự không hợp lệ.
UPDATE "users"
SET "username" = regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g');

-- Phòng trường hợp email cho ra chuỗi rỗng (vd: "@company.vn").
UPDATE "users"
SET "username" = 'user_' || substr("id", 1, 8)
WHERE "username" IS NULL OR "username" = '';

-- Hai email khác domain có thể cho cùng một username (an@a.vn / an@b.vn).
-- Giữ nguyên bản ghi cũ nhất, các bản sau nối thêm số thứ tự.
WITH ranked AS (
  SELECT "id",
         "username",
         row_number() OVER (PARTITION BY "username" ORDER BY "createdAt", "id") AS position
  FROM "users"
)
UPDATE "users" AS u
SET "username" = u."username" || ranked.position::text
FROM ranked
WHERE u."id" = ranked."id" AND ranked.position > 1;

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
