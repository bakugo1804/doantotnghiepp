import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { calcDeclarationTotals } from '../src/customs/financial-rules';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const adminPass = await bcrypt.hash('Admin@123456', 12);
  const staffPass = await bcrypt.hash('Staff@123456', 12);
  const viewerPass = await bcrypt.hash('Viewer@123456', 12);

  // Tài khoản mẫu: số điện thoại theo đúng đầu số nhà mạng Việt Nam, giờ đăng nhập
  // gần đây rải rác để trang Người dùng có dữ liệu hoạt động thật thay vì trống.
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000);

  const userSeeds = [
    { email: 'admin@customs.vn', username: 'admin', password: adminPass, fullName: 'Vũ Đình Khoa', phone: '0903845127', role: 'ADMIN' as const, lastLoginAt: hoursAgo(1) },
    { email: 'staff@customs.vn', username: 'staff', password: staffPass, fullName: 'Đặng Thị Mai Hương', phone: '0987216340', role: 'STAFF' as const, lastLoginAt: hoursAgo(5) },
    { email: 'le.thu@customs.vn', username: 'le.thu', password: staffPass, fullName: 'Lê Minh Thu', phone: '0913472068', role: 'DIRECTOR' as const, lastLoginAt: hoursAgo(26) },
    { email: 'nguyen.an@customs.vn', username: 'nguyen.an', password: staffPass, fullName: 'Nguyễn Hoài An', phone: '0975638214', role: 'STAFF' as const, lastLoginAt: hoursAgo(52) },
    { email: 'tran.ha@customs.vn', username: 'tran.ha', password: viewerPass, fullName: 'Trần Ngọc Hà', phone: '0902573418', role: 'VIEWER' as const, lastLoginAt: hoursAgo(190) },
    // Cố ý chưa từng đăng nhập, để giao diện có trường hợp "Chưa từng đăng nhập".
    { email: 'pham.long@customs.vn', username: 'pham.long', password: viewerPass, fullName: 'Phạm Đức Long', phone: '0938105742', role: 'VIEWER' as const, lastLoginAt: null },
  ];

  /**
   * Tạo tài khoản mẫu mà KHÔNG tranh chấp với tài khoản thật của người dùng.
   *
   * Email và tên đăng nhập đều là khoá duy nhất, nên `upsert` theo email vẫn đổ khi
   * tên đăng nhập đã thuộc về một email khác: người dùng tự tạo "admin@gmail.com"
   * với username "admin" là seed lỗi P2002 và dừng giữa đường, không chèn được gì.
   * Gặp trường hợp đó thì dùng luôn tài khoản đang có thay vì tạo bản trùng - và
   * quan trọng hơn là không ghi đè mật khẩu tài khoản thật của họ.
   */
  const seededUsers = [];
  for (const seed of userSeeds) {
    const { email, username, ...rest } = seed;
    const byEmail = await prisma.user.findUnique({ where: { email } });
    const byUsername = await prisma.user.findUnique({ where: { username } });

    if (byEmail) {
      // Chạy lại seed thì làm mới dữ liệu demo, nhưng chỉ nhận username khi nó chưa
      // bị tài khoản khác chiếm.
      const canTakeUsername = !byUsername || byUsername.id === byEmail.id;
      seededUsers.push(
        await prisma.user.update({
          where: { id: byEmail.id },
          data: canTakeUsername ? { username, ...rest } : rest,
        }),
      );
      continue;
    }

    if (byUsername) {
      seededUsers.push(byUsername);
      continue;
    }

    seededUsers.push(await prisma.user.create({ data: { email, username, ...rest } }));
  }

  const admin = seededUsers[0];
  const staff = seededUsers[1];
  const extraUsers = seededUsers.slice(2);

  // Doanh nghiệp mẫu: mã số thuế, đầu số điện thoại cố định và địa chỉ khớp đúng
  // với tỉnh thành - dữ liệu trông thật thì phần demo mới thuyết phục.
  const companySeeds = [
    { name: 'Công ty TNHH Thương mại ABC Việt Nam', role: 'EXPORTER', contactEmail: 'xuatkhau@abcvn.com.vn', contactPhone: '02838256147', address: '128 Nguyễn Thị Minh Khai, P. Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh', notes: 'MST: 0301234567' },
    { name: 'Công ty Cổ phần Xuất nhập khẩu XYZ', role: 'IMPORTER', contactEmail: 'nhapkhau@xyzcorp.vn', contactPhone: '02437823164', address: 'Tầng 8, Toà nhà Detech, 8 Tôn Thất Thuyết, Cầu Giấy, Hà Nội', notes: 'MST: 0102938475' },
    { name: 'Công ty TNHH Logistics Đông Dương', role: 'EXPORTER', contactEmail: 'operations@dongduonglog.vn', contactPhone: '02873042158', address: 'Lô B12, KCN Cát Lái, TP. Thủ Đức, TP. Hồ Chí Minh', notes: 'MST: 0312845690' },
    { name: 'Công ty Cổ phần Bán lẻ Thành Công', role: 'IMPORTER', contactEmail: 'thumua@thanhcongretail.vn', contactPhone: '02363827491', address: '234 Nguyễn Văn Linh, Q. Hải Châu, TP. Đà Nẵng', notes: 'MST: 0401627384' },
    { name: 'Công ty TNHH Dệt may Bắc Nam', role: 'IMPORTER', contactEmail: 'vattu@bacnamtex.vn', contactPhone: '02253846217', address: 'KCN Nomura, H. An Dương, TP. Hải Phòng', notes: 'MST: 0200734851' },
    { name: 'Công ty CP Dược phẩm Hà Nội', role: 'IMPORTER', contactEmail: 'nhapkhau@duochanoi.vn', contactPhone: '02438267194', address: '2 Hàng Bài, Q. Hoàn Kiếm, Hà Nội', notes: 'MST: 0100845273' },
  ];

  for (const company of companySeeds) {
    await prisma.company.upsert({
      where: { name: company.name },
      update: company,
      create: { ...company, createdById: admin.id },
    });
  }

  // Danh mục mã HS khởi tạo.
  //
  // Mã HS quyết định thuế suất VAT và thuế nhập khẩu của từng dòng hàng, nên danh
  // mục phải có sẵn từ đầu để nhân viên chọn thay vì gõ tay. Chương mã HS ở đây
  // được chọn để bộ dữ liệu demo có đủ các mức thuế khác nhau (0%, 5%, 8%, 10%).
  const hsCodeSeeds = [
    { code: '8471.30', description: 'Máy tính xách tay', defaultUnit: 'cái' },
    { code: '8517.12', description: 'Điện thoại di động', defaultUnit: 'cái' },
    { code: '8528.72', description: 'Tivi màu', defaultUnit: 'cái' },
    { code: '8708.29', description: 'Phụ tùng ô tô', defaultUnit: 'bộ' },
    { code: '7208.51', description: 'Thép tấm cán nóng', defaultUnit: 'tấn' },
    { code: '3926.90', description: 'Sản phẩm nhựa khác', defaultUnit: 'kiện' },
    { code: '5208.39', description: 'Vải cotton dệt thoi', defaultUnit: 'cuộn' },
    { code: '6109.10', description: 'Áo phông cotton', defaultUnit: 'chiếc' },
    { code: '6403.99', description: 'Giày dép da', defaultUnit: 'đôi' },
    { code: '1905.90', description: 'Bánh kẹo các loại', defaultUnit: 'thùng' },
    { code: '0901.21', description: 'Cà phê đã rang', defaultUnit: 'bao' },
    { code: '1006.30', description: 'Gạo đã xát', defaultUnit: 'tấn' },
    { code: '3004.90', description: 'Dược phẩm đóng gói', defaultUnit: 'hộp' },
    { code: '9403.60', description: 'Đồ gỗ nội thất', defaultUnit: 'bộ' },
    { code: '4901.99', description: 'Sách in các loại', defaultUnit: 'kiện' },
  ];

  for (const hsCode of hsCodeSeeds) {
    await prisma.hsCode.upsert({
      where: { code: hsCode.code },
      update: { description: hsCode.description, defaultUnit: hsCode.defaultUnit, autoCreated: false },
      create: { ...hsCode, autoCreated: false, createdById: admin.id },
    });
  }
  console.log(`🏷️  Danh mục mã HS: ${hsCodeSeeds.length} mã`);

  // Tên doanh nghiệp ở đây phải TRÙNG KHỚP với companySeeds phía trên.
  //
  // Danh bạ công ty nối bản ghi danh bạ với tờ khai bằng chính cái tên, nên tờ khai
  // ghi "Công ty TNHH ABC" trong khi danh bạ ghi "Công ty TNHH Thương mại ABC Việt
  // Nam" sẽ sinh ra hai thẻ công ty gần giống nhau: một thẻ có đầy đủ mã số thuế
  // nhưng 0 hồ sơ, một thẻ có hồ sơ nhưng trống thông tin liên hệ.
  const customsSamples = [
    {
      recordNo: 'TK2024001',
      entryDate: new Date('2024-01-15'),
      exitDate: new Date('2024-01-17'),
      transportType: 'AIR' as const,
      leg1Origin: 'HAN',
      leg1Destination: 'SGN',
      flightNo: 'VN123',
      exporterName: 'Công ty TNHH Thương mại ABC Việt Nam',
      exporterCountry: 'CN',
      importerName: 'Công ty Cổ phần Xuất nhập khẩu XYZ',
      importerCountry: 'VN',
      currency: 'USD',
      status: 'APPROVED' as const,
      createdById: admin.id,
      materials: [
        { itemNo: 1, hsCode: '8471.30', description: 'Máy tính xách tay', quantity: 10, unit: 'cái', unitPrice: 800, totalPrice: 8000, origin: 'CN', weight: 22 },
        { itemNo: 2, hsCode: '8517.12', description: 'Điện thoại di động', quantity: 5, unit: 'cái', unitPrice: 400, totalPrice: 2000, origin: 'KR', weight: 1.25 },
      ],
    },
    {
      recordNo: 'TK2024002',
      entryDate: new Date('2024-02-04'),
      exitDate: new Date('2024-02-22'),
      transportType: 'SEA' as const,
      leg1Origin: 'SHANGHAI',
      leg1Destination: 'HAIPHONG',
      vesselName: 'Ocean Pearl',
      exporterName: 'Công ty TNHH Logistics Đông Dương',
      exporterCountry: 'CN',
      importerName: 'Công ty TNHH Dệt may Bắc Nam',
      importerCountry: 'VN',
      currency: 'USD',
      status: 'PROCESSING' as const,
      createdById: staff.id,
      materials: [
        { itemNo: 1, hsCode: '5208.39', description: 'Vải cotton cuộn', quantity: 120, unit: 'cuộn', unitPrice: 80, totalPrice: 9600, origin: 'CN', weight: 2160 },
        { itemNo: 2, hsCode: '9606.22', description: 'Khuy áo kim loại', quantity: 300, unit: 'hộp', unitPrice: 24, totalPrice: 7200, origin: 'TH', weight: 150 },
      ],
    },
    {
      recordNo: 'TK2024003',
      entryDate: new Date('2024-03-11'),
      exitDate: new Date('2024-03-15'),
      transportType: 'ROAD' as const,
      leg1Origin: 'BANGKOK',
      leg1Destination: 'DANANG',
      exporterName: 'Công ty Thực phẩm Mekong',
      exporterCountry: 'TH',
      importerName: 'Công ty Cổ phần Bán lẻ Thành Công',
      importerCountry: 'VN',
      currency: 'USD',
      status: 'DRAFT' as const,
      createdById: extraUsers[0].id,
      materials: [
        { itemNo: 1, hsCode: '1905.90', description: 'Bánh gạo đóng gói', quantity: 500, unit: 'thùng', unitPrice: 12.4, totalPrice: 6200, origin: 'TH', weight: 3000 },
      ],
    },
  ];

  // Bộ dữ liệu trải đều 12 tháng gần nhất.
  //
  // Ba tờ khai mẫu phía trên có ngày cố định năm 2024, nên mọi biểu đồ theo khung
  // 12 tháng gần nhất đều rỗng khi chạy demo ở thời điểm khác. Phần dưới sinh dữ
  // liệu bám theo ngày hiện tại để dashboard luôn có gì đó để vẽ.
  //
  // Dùng bộ sinh số giả ngẫu nhiên có hạt giống cố định: chạy seed nhiều lần vẫn
  // ra đúng bộ số tờ khai đó, nên bước kiểm tra trùng bên dưới giữ được tính
  // idempotent thay vì đẻ thêm bản ghi mới mỗi lần chạy.
  const createRandom = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const random = createRandom(20260101);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];

  // Dùng đúng tên trong danh bạ công ty phía trên để hai màn hình khớp nhau.
  const exporters = [
    'Công ty TNHH Thương mại ABC Việt Nam',
    'Công ty TNHH Logistics Đông Dương',
    'Shanghai Textile Import & Export Co., Ltd',
    'Samsung Electronics Vietnam Co., Ltd',
    'Thai Agri Foods Public Co., Ltd',
    'Global Trade Partners Pte Ltd',
  ] as const;
  const importers = [
    'Công ty Cổ phần Xuất nhập khẩu XYZ',
    'Công ty TNHH Dệt may Bắc Nam',
    'Công ty Cổ phần Bán lẻ Thành Công',
    'Công ty CP Dược phẩm Hà Nội',
    'Công ty TNHH Điện tử Sao Mai',
    'Công ty TNHH Ô tô Trường Phát',
  ] as const;
  const transports = ['AIR', 'SEA', 'ROAD', 'RAIL'] as const;
  // Trạng thái lặp lại theo tần suất thực tế: đa số hồ sơ đã xong, chỉ số ít bị từ chối.
  const statusPool = [
    'COMPLETED', 'COMPLETED', 'COMPLETED', 'APPROVED', 'APPROVED', 'APPROVED',
    'PROCESSING', 'PROCESSING', 'SUBMITTED', 'DRAFT', 'REJECTED',
  ] as const;
  // weightPerUnit (kg) để phí vận chuyển của dữ liệu demo phản ánh đúng thực tế:
  // một tấn thép và một hộp thuốc không thể cùng mức phí.
  const goods = [
    { hsCode: '8471.30', description: 'Máy tính xách tay', unit: 'cái', unitPrice: 800, weightPerUnit: 2.2 },
    { hsCode: '8517.12', description: 'Điện thoại di động', unit: 'cái', unitPrice: 420, weightPerUnit: 0.25 },
    { hsCode: '5208.39', description: 'Vải cotton cuộn', unit: 'cuộn', unitPrice: 80, weightPerUnit: 18 },
    { hsCode: '1905.90', description: 'Bánh gạo đóng gói', unit: 'thùng', unitPrice: 12.4, weightPerUnit: 6 },
    { hsCode: '3004.90', description: 'Dược phẩm đóng gói', unit: 'hộp', unitPrice: 36, weightPerUnit: 0.4 },
    { hsCode: '8708.29', description: 'Phụ tùng ô tô', unit: 'bộ', unitPrice: 260, weightPerUnit: 12 },
    { hsCode: '7208.51', description: 'Thép tấm cán nóng', unit: 'tấn', unitPrice: 640, weightPerUnit: 1000 },
  ] as const;

  /** Số ngày đi đường theo phương thức - đường biển lâu nhất, hàng không nhanh nhất. */
  const transitDays = (transportType: string, seed: number) => {
    const range: Record<string, [number, number]> = { AIR: [1, 3], ROAD: [2, 6], RAIL: [4, 9], SEA: [12, 28] };
    const [min, max] = range[transportType] ?? [5, 12];
    return min + Math.floor(seed * (max - min + 1));
  };
  const creatorIds = [admin.id, staff.id, extraUsers[0].id, extraUsers[1].id];
  const routes = {
    AIR: { origin: 'HAN', destination: 'SGN' },
    SEA: { origin: 'SHANGHAI', destination: 'HAIPHONG' },
    ROAD: { origin: 'BANGKOK', destination: 'DANANG' },
    RAIL: { origin: 'NANNING', destination: 'HANOI' },
  } as const;

  const seedNow = new Date();
  const generated: typeof customsSamples = [] as any;

  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo -= 1) {
    const anchor = new Date(seedNow.getFullYear(), seedNow.getMonth() - monthsAgo, 1);
    const recordsThisMonth = 3 + Math.floor(random() * 5);

    for (let index = 0; index < recordsThisMonth; index += 1) {
      // Tháng hiện tại chỉ sinh tới hôm nay, tránh tạo tờ khai có ngày ở tương lai.
      const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
      const maxDay = monthsAgo === 0 ? seedNow.getDate() : lastDay;
      const entryDate = new Date(anchor.getFullYear(), anchor.getMonth(), 1 + Math.floor(random() * maxDay));

      const transportType = pick(transports);
      const route = routes[transportType];
      const materials = Array.from({ length: 1 + Math.floor(random() * 3) }, (_, itemIndex) => {
        const item = pick(goods);
        const quantity = 5 + Math.floor(random() * 180);
        return {
          itemNo: itemIndex + 1,
          hsCode: item.hsCode,
          description: item.description,
          quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: Number((quantity * item.unitPrice).toFixed(2)),
          origin: pick(['CN', 'KR', 'TH', 'JP', 'VN'] as const),
          // Trọng lượng là biến chính khi tính phí vận chuyển, nên dữ liệu demo
          // không được để trống - nếu trống thì mọi tờ khai mẫu đều rơi về mức
          // phí tối thiểu 1kg và biểu đồ chi phí trở nên vô nghĩa.
          weight: Number((quantity * item.weightPerUnit).toFixed(3)),
        };
      });

      const exporterName = pick(exporters);
      const importerName = pick(importers);
      const exporterCountry = pick(['CN', 'KR', 'JP', 'TH', 'SG'] as const);

      // Thuế và phí do đúng bộ quy tắc của ứng dụng tính ra, không còn bịa số.
      // Trước đây seed tự đặt VAT ngẫu nhiên 8/10% và phí vận chuyển random, nên
      // dữ liệu demo không khớp với con số mà chính hệ thống sẽ tính lại.
      const totals = calcDeclarationTotals(materials, {
        exporterCountry,
        importerCountry: 'VN',
        transportType,
      });

      const month = `${anchor.getMonth() + 1}`.padStart(2, '0');
      generated.push({
        recordNo: `TK${anchor.getFullYear()}${month}-${`${index + 1}`.padStart(4, '0')}`,
        entryDate,
        // Hành trình kết thúc sau vài ngày đi đường, tuỳ phương thức vận chuyển.
        exitDate: new Date(entryDate.getTime() + transitDays(transportType, random()) * 86400000),
        transportType,
        leg1Origin: route.origin,
        leg1Destination: route.destination,
        ...(transportType === 'AIR' ? { flightNo: `VN${100 + Math.floor(random() * 800)}` } : {}),
        ...(transportType === 'SEA' ? { vesselName: pick(['Ocean Pearl', 'Blue Horizon', 'Pacific Star'] as const) } : {}),
        exporterName,
        exporterCountry,
        importerName,
        importerCountry: 'VN',
        currency: 'USD',
        vatRate: totals.vatRate,
        vatAmount: totals.vatAmount,
        importDutyRate: totals.importDutyRate,
        importDutyAmount: totals.importDutyAmount,
        shippingFee: totals.shippingFee,
        totalWeight: totals.totalWeight,
        distanceKm: totals.distanceKm,
        totalValue: totals.totalValue,
        totalPayable: totals.totalPayable,
        status: pick(statusPool),
        createdById: pick(creatorIds),
        materials,
      } as any);
    }
  }

  /**
   * Nhật ký chuyển trạng thái cho một tờ khai mẫu.
   *
   * Không có phần này thì mọi tờ khai demo đều hiện khối "Nhật ký xử lý" trống,
   * trong khi đó lại chính là chỗ chứng minh hệ thống truy vết được ai duyệt và
   * vào lúc nào.
   */
  const buildStatusHistory = (status: string, entryDate: Date, ownerId: string) => {
    const path: Record<string, string[]> = {
      DRAFT: ['DRAFT'],
      SUBMITTED: ['DRAFT', 'SUBMITTED'],
      PROCESSING: ['DRAFT', 'SUBMITTED', 'PROCESSING'],
      APPROVED: ['DRAFT', 'SUBMITTED', 'PROCESSING', 'APPROVED'],
      COMPLETED: ['DRAFT', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'COMPLETED'],
      REJECTED: ['DRAFT', 'SUBMITTED', 'PROCESSING', 'REJECTED'],
    };
    const notes: Record<string, string> = {
      DRAFT: 'Khởi tạo tờ khai',
      SUBMITTED: 'Nộp hồ sơ kèm hoá đơn và vận đơn',
      PROCESSING: 'Đã tiếp nhận, đang kiểm tra chứng từ',
      APPROVED: 'Chứng từ hợp lệ, đồng ý thông quan',
      COMPLETED: 'Đã thông quan, kết thúc hồ sơ',
      REJECTED: 'Hồ sơ thiếu chứng từ xuất xứ, trả lại doanh nghiệp',
    };
    const steps = path[status] ?? ['DRAFT'];
    return steps.map((toStatus, index) => ({
      fromStatus: index === 0 ? null : (steps[index - 1] as any),
      toStatus: toStatus as any,
      note: notes[toStatus],
      // Mỗi bước cách nhau vài giờ kể từ ngày bắt đầu vận chuyển.
      createdAt: new Date(entryDate.getTime() + index * 7 * 3600000),
      // Duyệt và từ chối là quyết định của cấp quản lý, không phải nhân viên.
      changedById: toStatus === 'APPROVED' || toStatus === 'COMPLETED' || toStatus === 'REJECTED' ? admin.id : ownerId,
    }));
  };

  let createdCount = 0;
  for (const sample of [...customsSamples, ...generated] as any[]) {
    const exists = await prisma.customsRecord.findUnique({ where: { recordNo: sample.recordNo } });
    if (exists) continue;

    // Số liệu tài chính luôn do bộ quy tắc của ứng dụng tính, kể cả với ba tờ khai
    // mẫu viết tay: dữ liệu demo mà lệch với công thức thật thì lúc bảo vệ sẽ bị
    // hỏi ngay tại sao mở tờ khai ra lại thấy con số khác.
    const totals = calcDeclarationTotals(sample.materials, {
      exporterCountry: sample.exporterCountry,
      importerCountry: sample.importerCountry,
      transportType: sample.transportType,
      distanceKm: sample.distanceKm,
    });

    await prisma.customsRecord.create({
      data: {
        ...sample,
        vatRate: totals.vatRate,
        vatAmount: totals.vatAmount,
        importDutyRate: totals.importDutyRate,
        importDutyAmount: totals.importDutyAmount,
        shippingFee: totals.shippingFee,
        totalWeight: totals.totalWeight,
        distanceKm: totals.distanceKm,
        totalValue: totals.totalValue,
        totalPayable: totals.totalPayable,
        materials: { create: sample.materials },
        statusHistory: { create: buildStatusHistory(sample.status, sample.entryDate, sample.createdById) },
      },
    });
    createdCount += 1;
  }
  console.log(`📦 Đã tạo thêm ${createdCount} tờ khai (tổng mẫu: ${customsSamples.length + generated.length})`);

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
