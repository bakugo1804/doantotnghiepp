import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CustomsModule } from '../customs/customs.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [CustomsModule, AiModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
