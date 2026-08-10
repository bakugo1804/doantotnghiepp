# 🛃 Customs Management App — Ứng dụng Quản Lý Hải Quan

Hệ thống quản lý tờ khai xuất nhập khẩu cho **một doanh nghiệp**: khai báo tờ khai,
quy trình duyệt nhiều bước, tính thuế VAT và phí vận chuyển tự động, đọc file
Excel/PDF bằng AI, báo cáo có biểu đồ và trợ lý AI chạy hoàn toàn miễn phí trên máy.

---

## 🚀 Chạy dự án

Cần cài sẵn **Docker Desktop**.

### Dựng lại từ đầu trên máy mới

Chỉ cần **Docker Desktop** và **Git**. Không cần cài Node.js, không cần
PostgreSQL, không phải chạy `npm install`, và **không cần tạo file `.env` nào** —
mọi biến trong `docker-compose.yml` đều đã có sẵn giá trị mặc định.

```bash
git clone https://github.com/bakugo1804/doantotnghiepp
cd doantotnghiepp
docker-compose up -d --build
```

Lần đầu build mất khoảng 5–10 phút. Sau đó tạo cấu trúc database và dữ liệu mẫu —
chạy bên trong container nên máy không cần Node.js:

```bash
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend npx ts-node prisma/seed.ts
```

Xong thì mở http://localhost:3000 và đăng nhập `admin` / `Admin@123456`.

> **Phải seed xong rồi mới chuyển sang chế độ trình diễn.** Image `production`
> cài bằng `npm ci --only=production` nên không có `ts-node` lẫn `prisma` CLI,
> lúc đó không seed được nữa.

Muốn dùng cả chatbox AI thì cài thêm Ollama (xem mục [Trợ lý AI](#-trợ-lý-ai-miễn-phí-không-cần-api-key)).

### Khi demo / bảo vệ đồ án — dùng lệnh này

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Frontend chạy bản đã build sẵn nên **không còn cảnh chờ "Compiling..."** mỗi lần mở
một trang mới (đo được 47–124 ms/trang thay vì vài giây). Đổi lại, sửa code sẽ
không tự cập nhật — phải build lại.

### Khi đang viết code

```bash
docker-compose up -d
```

| Thành phần | Địa chỉ |
|---|---|
| Giao diện | http://localhost:3000 |
| API | http://localhost:3001 |
| Tài liệu API (Swagger) | http://localhost:3001/api |

**Dừng lại khi không dùng** (đóng cửa sổ terminal KHÔNG dừng container):

```bash
docker-compose down
```

`docker-compose down` giữ nguyên dữ liệu. Chỉ `docker-compose down -v` mới xoá database.

### Lần đầu chạy: tạo dữ liệu mẫu

```bash
cd backend
npx prisma migrate deploy
npx ts-node prisma/seed.ts
```

Seed sinh 6 tài khoản, 6 doanh nghiệp và ~56 tờ khai trải đều 12 tháng gần nhất
để biểu đồ có dữ liệu thật. Chạy lại nhiều lần không tạo trùng.

---

## 👤 Tài khoản mặc định

Đăng nhập bằng **tên đăng nhập hoặc email**, mật khẩu như nhau:

| Tên đăng nhập | Email | Mật khẩu | Vai trò |
|---|---|---|---|
| `admin` | admin@customs.vn | `Admin@123456` | Giám đốc |
| `le.thu` | le.thu@customs.vn | `Staff@123456` | Trưởng phòng |
| `staff` | staff@customs.vn | `Staff@123456` | Nhân viên |
| `tran.ha` | tran.ha@customs.vn | `Viewer@123456` | Người xem |

### Phân quyền

Hệ thống phục vụ **một doanh nghiệp**, cây quyền lực đi theo sơ đồ tổ chức công ty:

| Vai trò | Quyền |
|---|---|
| **Giám đốc** (ADMIN) | Toàn quyền: quản lý nhân sự, phân quyền, duyệt và xoá tờ khai |
| **Trưởng phòng** (DIRECTOR) | Quản lý nhân viên, giao việc, duyệt tờ khai |
| **Nhân viên** (STAFF) | Tạo và xử lý tờ khai, cập nhật công việc được giao |
| **Người xem** (VIEWER) | Chỉ xem, không chỉnh sửa |

---

## 🤖 Trợ lý AI (miễn phí, không cần API key)

Chatbox dùng **[Ollama](https://ollama.com/download)** chạy trên máy — không tốn phí,
không cần thẻ tín dụng, dữ liệu không rời khỏi máy.

```bash
# 1. Cài Ollama
winget install Ollama.Ollama        # Windows
# hoặc tải tại https://ollama.com/download

# 2. Tải model (~1.9 GB)
ollama pull qwen2.5:3b
```

Ollama tự chạy nền sau khi cài. Backend kết nối qua `http://host.docker.internal:11434/v1`
(đã cấu hình sẵn trong `docker-compose.yml`).

**Đổi sang nhà cung cấp khác** — sửa 3 biến trong `docker-compose.yml`, không cần đụng code:

```yaml
AI_BASE_URL: https://api.groq.com/openai/v1   # hoặc OpenAI, Gemini...
AI_MODEL: llama-3.3-70b-versatile
AI_API_KEY: <khoá của bạn>
```

---

## 📋 Quy trình duyệt tờ khai

Tờ khai không thể nhảy tuỳ ý giữa các trạng thái — hệ thống ép đúng luồng và
đúng thẩm quyền, mọi bước đều được ghi nhật ký (ai, lúc nào, ghi chú gì):

```
Nháp ──► Đã nộp ──► Đang xử lý ──► Đã duyệt ──► Hoàn thành
           │             │
           └──► Từ chối ◄┘  ──► (sửa lại) ──► Nháp
```

- **Duyệt / Từ chối / Hoàn thành**: chỉ Giám đốc và Trưởng phòng.
- **Nộp / Tiếp nhận xử lý**: Nhân viên trở lên.
- Xem nhật ký đầy đủ ở trang chi tiết tờ khai.

Định nghĩa nằm ở [`backend/src/customs/status-workflow.ts`](backend/src/customs/status-workflow.ts).

---

## 🧮 Quy tắc tính toán

- **Thuế VAT** áp theo quốc gia nhập khẩu (VN 10%, CN 13%, TH 7%, EU 20%…)
- **Phí vận chuyển** tính theo tuyến (nước đi → nước đến) và quãng đường
- **Số liệu tổng hợp** quy đổi về USD trước khi cộng — mỗi tờ khai mang tỷ giá riêng,
  cộng thẳng sẽ trộn lẫn VND với USD

Xem [`backend/src/customs/financial-rules.ts`](backend/src/customs/financial-rules.ts).

---

## 🛠 Tech Stack

- **Frontend**: Next.js 16 · TypeScript · Tailwind CSS · TanStack Query
- **Backend**: NestJS · Prisma ORM · JWT + phân quyền theo vai trò
- **Database**: PostgreSQL 16
- **AI**: Ollama (local) — tương thích chuẩn OpenAI
- **Realtime**: Socket.io

Biểu đồ được vẽ bằng **SVG thuần, không dùng thư viện chart** — nằm ở
[`frontend/src/components/charts/`](frontend/src/components/charts/). Bảng màu đã
kiểm chứng cho người mù màu (protan/deutan/tritan) ở cả giao diện sáng và tối;
mỗi biểu đồ đều có nút chuyển sang bảng số liệu.

---

## 💻 Chạy không dùng Docker (tuỳ chọn)

```bash
docker-compose up -d postgres    # chỉ cần database

cd backend && npm install && npm run start:dev
cd frontend && npm install && npm run dev
```

Cần file `backend/.env` với `DATABASE_URL`, `JWT_SECRET`, `PORT=3001`.

---

## 🧹 Bảo trì: khi ổ đĩa đầy dần

Docker ở đây chạy nền **Hyper-V**, dữ liệu nằm trong một file đĩa ảo duy nhất:
`C:\ProgramData\DockerDesktop\vm-data\DockerDesktop.vhdx`.

File này **chỉ phình ra chứ không tự co lại**. Xoá image hay volume bên trong chỉ
giải phóng chỗ *bên trong máy ảo*, Windows vẫn thấy file to như cũ. Khi ổ C gần đầy
thì Docker engine sập, biểu hiện là mọi lệnh `docker` báo
`request returned 500 Internal Server Error`.

Dọn định kỳ:

```powershell
docker builder prune -af      # xoá cache build (thường vài GB)
docker image prune -af        # xoá image không dùng
docker volume ls -qf dangling=true   # xem volume mồ côi trước khi xoá
```

Sau đó **tắt Docker Desktop hẳn** rồi mở lại — file đĩa ảo được nén lại lúc máy ảo
tắt sạch, đây mới là bước thực sự trả chỗ trống về cho Windows.

Muốn dời hẳn dữ liệu Docker sang ổ khác: Settings → Resources → Advanced → *Disk
image location*. Nếu báo lỗi `Source and destination directory owners mismatch`
thì do thư mục đích được tạo bằng tài khoản thường; chạy PowerShell với quyền
Administrator và gán lại chủ sở hữu cho khớp với thư mục nguồn:

```powershell
icacls "D:\DockerDesktop" /setowner "Administrators" /T /C
icacls "D:\DockerDesktop" /grant "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" /T /C
```

---

## ⚠️ Lưu ý khi phát triển

**Không mount `/app/dist` hay `/app/node_modules` thành anonymous volume trong
`docker-compose.yml`.** Docker giữ lại các volume đó giữa những lần recreate, nên
chúng che mất thư mục tương ứng trong image mới — sửa code rồi rebuild vẫn chạy
bản cũ, rất khó phát hiện. Backend hiện dùng stage `dev` với `nest --watch`, sửa
file trong `backend/src` là tự biên dịch lại.

---

## 📁 Cấu trúc

```
doantotnghiepp/
├── backend/              # NestJS
│   ├── prisma/           # schema, migrations, seed
│   └── src/
│       ├── auth/         # đăng nhập bằng username hoặc email, JWT
│       ├── customs/      # nghiệp vụ tờ khai + quy trình duyệt
│       ├── ai/           # đọc Excel/PDF, chatbox
│       └── reports/      # xuất Excel/PDF, chuyển đổi file
├── frontend/             # Next.js
│   └── src/
│       ├── app/          # các trang
│       ├── components/   # charts/, customs/, layout/
│       └── lib/          # api, utils, viz, reference-data
└── docker-compose.yml
```
