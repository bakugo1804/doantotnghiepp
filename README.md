# 🛃 Customs Management App - Ứng dụng Quản Lý Hải Quan

---

## 📌 TRẠNG THÁI DỰ ÁN (cập nhật 23/06/2026)

### ✅ ĐÃ HOÀN THÀNH (TOÀN BỘ)
- Toàn bộ **61 files scaffold** đã được tạo tại `d:\Đồ án tốt nghiệp\customs-app\`
- **Backend (NestJS):** Auth JWT+Roles, Customs CRUD, Materials, Reports (Excel export), AI (OpenAI chat + parse Excel), Chat (Socket.io), Users
- **Frontend (Next.js 15):** Login, Register, Dashboard layout, Sidebar, Header, Tờ khai table+form, Import Excel AI, Draggable Chatbox, Admin pages
- **Prisma schema:** Đầy đủ models (User, CustomsRecord, Material, Attachment, ChatMessage)
- **`npm install`** đã chạy xong cho cả backend và frontend
- **Node.js:** v24.17.0 — nằm tại `D:\Đồ án tốt nghiệp_Phenikaa_LTK_21012505\`
- **Docker:** PostgreSQL + Redis đang chạy (docker-compose up -d postgres redis)
- **Prisma:** migrate + seed xong — DB có data mẫu
- **backend/.env:** Đã tạo (PORT=3001, JWT, DATABASE_URL)
- **frontend/.env.local:** Đã tạo (NEXT_PUBLIC_API_URL, NEXTAUTH_SECRET)
- **TypeScript types:** `frontend/src/types/index.ts` — đầy đủ interfaces
- **React hooks:** `frontend/src/hooks/useCustoms.ts`, `useUsers.ts`
- **Backend đang chạy:** `http://localhost:3001` ✅ (nest start --watch)
- **Frontend đang chạy:** `http://localhost:3000` ✅ (next dev)
- **Login test OK:** admin@customs.vn / Admin@123456 trả về JWT token ✅

### ⚠️ CẦN LÀM KHI MỞ LẠI MÁY
Mỗi lần khởi động lại phải chạy lại:
1. `docker-compose up -d postgres redis` (từ thư mục customs-app)
2. Backend: `npm run start:dev` (từ thư mục backend)
3. Frontend: `npm run dev` (từ thư mục frontend)

### ⚠️ CẦN ĐIỀN THÊM
- `backend/.env` → thay `OPENAI_API_KEY=sk-placeholder-replace-with-real-key` bằng key thật

### ⏳ VIỆC CÓ THỂ LÀM TIẾP (tuỳ chọn)
- Test toàn bộ UI: đăng nhập, tạo tờ khai, export Excel
- Thêm unit/e2e tests
- Build production docker image cho backend và frontend
- Deploy lên VPS / cloud

---

## Tech Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: NestJS + TypeScript + Prisma ORM
- **Database**: PostgreSQL 16
- **AI**: OpenAI API (đọc Excel tự động)
- **Realtime**: Socket.io (chatbox)

## 🚀 Cài Đặt Môi Trường (Lần Đầu)

### Bước 1: Cài đặt các công cụ cần thiết
1. [Node.js LTS](https://nodejs.org/) - **BẮT BUỘC**
2. [Git](https://git-scm.com/) - **BẮT BUỘC**
3. [Docker Desktop](https://www.docker.com/products/docker-desktop/) - Để chạy PostgreSQL dễ dàng

### Bước 2: Cài pnpm (sau khi có npm)
```bash
npm install -g pnpm
```

### Bước 3: Clone / mở project và cài dependencies
```bash
# Cài backend
cd backend
pnpm install

# Cài frontend
cd ../frontend
pnpm install
```

### Bước 4: Tạo file .env
```bash
# Copy file mẫu
cp .env.example .env
# Điền thông tin vào .env
```

### Bước 5: Chạy database (cần Docker)
```bash
docker-compose up -d postgres
```

### Bước 6: Chạy Prisma migration
```bash
cd backend
pnpm prisma migrate dev --name init
pnpm prisma db seed
```

### Bước 7: Chạy ứng dụng
```bash
# Terminal 1 - Backend
cd backend && pnpm run start:dev

# Terminal 2 - Frontend
cd frontend && pnpm run dev
```

### Truy cập
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Docs (Swagger): http://localhost:3001/api

## Tài khoản mặc định (sau seed)
- **Admin**: admin@customs.vn / Admin@123456
- **Staff**: staff@customs.vn / Staff@123456

## Cấu trúc Project
```
customs-app/
├── frontend/          # Next.js 14
├── backend/           # NestJS
└── docker-compose.yml
```
