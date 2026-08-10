# Stage phát triển: vừa sửa file là thấy ngay trên trình duyệt.
FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Stage build: biên dịch sẵn toàn bộ trang.
#
# Ở chế độ dev, Next chỉ biên dịch một trang khi có người bấm vào nó - lần đầu mở
# mỗi trang đều phải chờ "Compiling...". Build sẵn sẽ dời toàn bộ phần chờ đó về
# lúc dựng image.
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Biến NEXT_PUBLIC_* được nhúng thẳng vào mã nguồn lúc build, đặt lúc chạy không
# còn tác dụng nữa.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage chạy thật: dùng cho lúc demo và bảo vệ đồ án.
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.* ./
EXPOSE 3000
CMD ["npm", "run", "start"]
