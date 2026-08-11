import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { HsCodesService } from './hs-codes.service';

@ApiTags('HS Codes - Danh mục mã HS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hs-codes')
export class HsCodesController {
  constructor(private hsCodesService: HsCodesService) {}

  // Mọi vai trò đều đọc được: form khai báo cần danh mục này để gợi ý mã.
  @ApiOperation({ summary: 'Danh sách mã HS' })
  @ApiQuery({ name: 'search', required: false })
  @Get()
  findAll(@Query('search') search?: string) {
    return this.hsCodesService.findAll(search);
  }

  // Nhân viên được thêm và sửa: chính họ là người gặp mặt hàng mới khi lập tờ khai.
  @ApiOperation({ summary: 'Thêm mã HS vào danh mục' })
  @Roles('ADMIN', 'DIRECTOR', 'STAFF')
  @Post()
  create(@Body() body: any, @Request() req) {
    return this.hsCodesService.create(body, req.user.sub);
  }

  @ApiOperation({ summary: 'Sửa mã HS' })
  @Roles('ADMIN', 'DIRECTOR', 'STAFF')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.hsCodesService.update(id, body);
  }

  // Xoá thì chỉ cấp quản lý, vì mã HS là dữ liệu dùng chung cho cả doanh nghiệp.
  @ApiOperation({ summary: 'Xoá mã HS khỏi danh mục' })
  @Roles('ADMIN', 'DIRECTOR')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hsCodesService.remove(id);
  }
}
