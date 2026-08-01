import { Module } from '@nestjs/common';
import { CustomsService } from './customs.service';
import { CustomsController } from './customs.controller';

@Module({
  providers: [CustomsService],
  controllers: [CustomsController],
  exports: [CustomsService],
})
export class CustomsModule {}
