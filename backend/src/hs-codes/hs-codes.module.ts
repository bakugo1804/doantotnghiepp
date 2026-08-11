import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HsCodesController } from './hs-codes.controller';
import { HsCodesService } from './hs-codes.service';

@Module({
  imports: [PrismaModule],
  controllers: [HsCodesController],
  providers: [HsCodesService],
  // CustomsModule dùng service này để tự bổ sung mã HS khi lưu tờ khai.
  exports: [HsCodesService],
})
export class HsCodesModule {}
