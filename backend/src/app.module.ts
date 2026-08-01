import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomsModule } from './customs/customs.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { ChatModule } from './chat/chat.module';
import { TasksModule } from './tasks/tasks.module';
import { SearchModule } from './search/search.module';
import { CompaniesModule } from './companies/companies.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomsModule,
    ReportsModule,
    AiModule,
    ChatModule,
    TasksModule,
    SearchModule,
    CompaniesModule,
    NotificationsModule,
  ],
})
export class AppModule {}
