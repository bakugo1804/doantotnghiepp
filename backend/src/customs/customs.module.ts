import { Module } from '@nestjs/common';
import { CustomsService } from './customs.service';
import { CustomsController } from './customs.controller';
import { HsCodesModule } from '../hs-codes/hs-codes.module';

@Module({
  // Lưu tờ khai xong sẽ bổ sung những mã HS mới vào danh mục dùng chung.
  imports: [HsCodesModule],
  providers: [CustomsService],
  controllers: [CustomsController],
  exports: [CustomsService],
})
export class CustomsModule {}
