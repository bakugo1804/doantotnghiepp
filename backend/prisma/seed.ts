import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const adminPass = await bcrypt.hash('Admin@123456', 12);
  const staffPass = await bcrypt.hash('Staff@123456', 12);
  const viewerPass = await bcrypt.hash('Viewer@123456', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@customs.vn' },
    update: {},
    create: { email: 'admin@customs.vn', password: adminPass, fullName: 'Quản trị viên', role: 'ADMIN' },
  });

  const staff = await prisma.user.upsert({
    where: { email: 'staff@customs.vn' },
    update: {},
    create: { email: 'staff@customs.vn', password: staffPass, fullName: 'Nhân viên hải quan', role: 'STAFF' },
  });

  const extraUsers = await Promise.all([
    prisma.user.upsert({
      where: { email: 'le.thu@customs.vn' },
      update: {},
      create: { email: 'le.thu@customs.vn', password: staffPass, fullName: 'Lê Minh Thu', phone: '0912000001', role: 'STAFF' },
    }),
    prisma.user.upsert({
      where: { email: 'nguyen.an@customs.vn' },
      update: {},
      create: { email: 'nguyen.an@customs.vn', password: staffPass, fullName: 'Nguyễn Hoài An', phone: '0912000002', role: 'STAFF' },
    }),
    prisma.user.upsert({
      where: { email: 'tran.ha@customs.vn' },
      update: {},
      create: { email: 'tran.ha@customs.vn', password: viewerPass, fullName: 'Trần Ngọc Hà', phone: '0912000003', role: 'VIEWER' },
    }),
    prisma.user.upsert({
      where: { email: 'pham.long@customs.vn' },
      update: {},
      create: { email: 'pham.long@customs.vn', password: viewerPass, fullName: 'Phạm Đức Long', phone: '0912000004', role: 'VIEWER' },
    }),
  ]);

  const companySeeds = [
    { name: 'Công ty TNHH ABC', role: 'EXPORTER', contactEmail: 'contact@abc.vn', contactPhone: '02839000001', address: 'Quận 1, TP.HCM' },
    { name: 'Công ty Cổ phần XYZ', role: 'IMPORTER', contactEmail: 'xnk@xyz.vn', contactPhone: '02439000002', address: 'Cầu Giấy, Hà Nội' },
    { name: 'Công ty Logistics Đông Dương', role: 'EXPORTER', contactEmail: 'ops@dongduong.vn', contactPhone: '02839000003', address: 'Thủ Đức, TP.HCM' },
    { name: 'Siêu thị Thành Công', role: 'IMPORTER', contactEmail: 'mua-hang@thanhcong.vn', contactPhone: '02363900004', address: 'Hải Châu, Đà Nẵng' },
  ];

  for (const company of companySeeds) {
    await prisma.company.upsert({
      where: { name: company.name },
      update: company,
      create: { ...company, createdById: admin.id },
    });
  }

  const customsSamples = [
    {
      recordNo: 'TK2024001',
      entryDate: new Date('2024-01-15'),
      transportType: 'AIR' as const,
      leg1Origin: 'HAN',
      leg1Destination: 'SGN',
      flightNo: 'VN123',
      exporterName: 'Công ty TNHH ABC',
      importerName: 'Công ty Cổ phần XYZ',
      currency: 'USD',
      vatRate: 10,
      shippingFee: 500,
      totalValue: 10000,
      vatAmount: 1000,
      totalPayable: 11500,
      status: 'APPROVED' as const,
      createdById: admin.id,
      materials: [
        { itemNo: 1, hsCode: '8471.30', description: 'Máy tính xách tay', quantity: 10, unit: 'cái', unitPrice: 800, totalPrice: 8000, origin: 'CN' },
        { itemNo: 2, hsCode: '8517.12', description: 'Điện thoại di động', quantity: 5, unit: 'cái', unitPrice: 400, totalPrice: 2000, origin: 'KR' },
      ],
    },
    {
      recordNo: 'TK2024002',
      entryDate: new Date('2024-02-04'),
      transportType: 'SEA' as const,
      leg1Origin: 'SHANGHAI',
      leg1Destination: 'HAIPHONG',
      vesselName: 'Ocean Pearl',
      exporterName: 'Công ty Logistics Đông Dương',
      importerName: 'Công ty May Bắc Nam',
      currency: 'USD',
      vatRate: 8,
      shippingFee: 720,
      totalValue: 16800,
      vatAmount: 1344,
      totalPayable: 18864,
      status: 'PROCESSING' as const,
      createdById: staff.id,
      materials: [
        { itemNo: 1, hsCode: '5208.39', description: 'Vải cotton cuộn', quantity: 120, unit: 'cuộn', unitPrice: 80, totalPrice: 9600, origin: 'CN' },
        { itemNo: 2, hsCode: '9606.22', description: 'Khuy áo kim loại', quantity: 300, unit: 'hộp', unitPrice: 24, totalPrice: 7200, origin: 'TH' },
      ],
    },
    {
      recordNo: 'TK2024003',
      entryDate: new Date('2024-03-11'),
      transportType: 'ROAD' as const,
      leg1Origin: 'BANGKOK',
      leg1Destination: 'DANANG',
      exporterName: 'Công ty Thực phẩm Mekong',
      importerName: 'Siêu thị Thành Công',
      currency: 'USD',
      vatRate: 10,
      shippingFee: 300,
      totalValue: 6200,
      vatAmount: 620,
      totalPayable: 7120,
      status: 'DRAFT' as const,
      createdById: extraUsers[0].id,
      materials: [
        { itemNo: 1, hsCode: '1905.90', description: 'Bánh gạo đóng gói', quantity: 500, unit: 'thùng', unitPrice: 12.4, totalPrice: 6200, origin: 'TH' },
      ],
    },
  ];

  for (const sample of customsSamples) {
    const exists = await prisma.customsRecord.findUnique({ where: { recordNo: sample.recordNo } });
    if (!exists) {
      await prisma.customsRecord.create({
        data: {
          ...sample,
          materials: {
            create: sample.materials,
          },
        },
      });
    }
  }

  const today = new Date();
  const workDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0, 0);
  const taskSamples = [
    {
      title: 'Rà soát hồ sơ TK2024002',
      description: 'Kiểm tra vận đơn và cập nhật trạng thái xử lý trước 15:00.',
      workDate,
      status: 'IN_PROGRESS' as const,
      assignedToId: staff.id,
      assignedById: admin.id,
    },
    {
      title: 'Liên hệ Công ty May Bắc Nam',
      description: 'Xác nhận lại chứng từ nhập khẩu còn thiếu trong bộ hồ sơ tháng này.',
      workDate,
      status: 'TODO' as const,
      assignedToId: extraUsers[0].id,
      assignedById: admin.id,
    },
    {
      title: 'Kiểm tra danh sách công ty mới',
      description: 'Đối chiếu thông tin doanh nghiệp mới tạo và đánh dấu các đơn vị trùng tên.',
      workDate,
      status: 'TODO' as const,
      assignedToId: extraUsers[1].id,
      assignedById: admin.id,
    },
  ];

  for (const task of taskSamples) {
    const exists = await prisma.task.findFirst({
      where: {
        title: task.title,
        assignedToId: task.assignedToId,
        workDate: task.workDate,
      },
    });
    if (!exists) {
      await prisma.task.create({ data: task });
    }
  }

  console.log('✅ Seed hoàn thành!');
  console.log(`👤 Admin: admin@customs.vn / Admin@123456`);
  console.log(`👤 Staff: staff@customs.vn / Staff@123456`);
  console.log(`👤 Viewer: tran.ha@customs.vn / Viewer@123456`);
  console.log(`👤 Viewer: pham.long@customs.vn / Viewer@123456`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
