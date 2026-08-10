import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Danh sách thông báo trong app' })
  @Get()
  list(@Request() req) {
    return this.notificationsService.list(req.user.sub);
  }

  @ApiOperation({ summary: 'Số thông báo chưa đọc' })
  @Get('unread-count')
  unreadCount(@Request() req) {
    return this.notificationsService.unreadCount(req.user.sub);
  }

  // Đặt trên :id/read để "read-all" không bị khớp nhầm thành id = "read-all".
  @ApiOperation({ summary: 'Đánh dấu tất cả đã đọc' })
  @Patch('read-all')
  markAllRead(@Request() req) {
    return this.notificationsService.markAllRead(req.user.sub);
  }

  @ApiOperation({ summary: 'Đánh dấu thông báo đã đọc' })
  @Patch(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markRead(id, req.user.sub);
  }

  @ApiOperation({ summary: 'Gửi thông báo từ app sang Gmail' })
  @Post('email/send')
  send(@Request() req, @Body() body: { subject: string; content: string }) {
    return this.notificationsService.sendToGmail(req.user.sub, body.subject, body.content);
  }

  @ApiOperation({ summary: 'Đồng bộ email Gmail vào app' })
  @Post('email/sync')
  sync(@Request() req) {
    return this.notificationsService.syncFromGmail(req.user.sub);
  }
}
