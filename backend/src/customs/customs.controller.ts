import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CustomsService } from './customs.service';
import { CreateCustomsDto } from './dto/create-customs.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

@ApiTags('Customs - Tờ khai hải quan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customs')
export class CustomsController {
  constructor(private customsService: CustomsService) {}

  @ApiOperation({ summary: 'Tạo tờ khai mới' })
  @Roles('ADMIN', 'DIRECTOR', 'STAFF')
  @Post()
  create(@Body() dto: CreateCustomsDto, @Request() req) {
    return this.customsService.create(dto, req.user);
  }

  @ApiOperation({ summary: 'Lấy danh sách tờ khai' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'transportType', required: false })
  @ApiQuery({ name: 'companyName', required: false })
  @Get()
  findAll(
    @Request() req,
    @Query('page') page?,
    @Query('limit') limit?,
    @Query('search') search?,
    @Query('status') status?,
    @Query('transportType') transportType?,
    @Query('companyName') companyName?,
  ) {
    return this.customsService.findAll(req.user, {
      page: +page || 1,
      limit: +limit || 20,
      search,
      status,
      transportType,
      companyName,
    });
  }

  // Không giới hạn vai trò: dữ liệu tờ khai vốn dùng chung toàn tổ chức (xem
  // toRecordScope), nên chặn STAFF/VIEWER xem thống kê của chính dữ liệu họ
  // đọc được ở GET /customs là mâu thuẫn. Phạm vi vẫn do toRecordScope quyết định.
  @ApiOperation({ summary: 'Thống kê tổng quan' })
  @Get('stats')
  getStats(@Request() req) {
    return this.customsService.getStats(req.user);
  }

  @ApiOperation({ summary: 'Danh sách công ty xuất nhập khẩu' })
  @Get('companies')
  getCompanies(@Request() req, @Query('search') search?: string) {
    return this.customsService.getCompanies(req.user, search);
  }

  @ApiOperation({ summary: 'Kiểm tra số tờ khai đã tồn tại chưa' })
  @Get('check-record-no')
  checkRecordNo(@Query('recordNo') recordNo: string) {
    return this.customsService.checkRecordNo(recordNo);
  }

  @ApiOperation({ summary: 'Chi tiết tờ khai' })
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.customsService.findOne(id, req.user);
  }

  @ApiOperation({ summary: 'Các bước xử lý tiếp theo mà vai trò hiện tại được phép làm' })
  @Get(':id/transitions')
  getTransitions(@Param('id') id: string, @Request() req) {
    return this.customsService.getAvailableTransitions(id, req.user);
  }

  // Quyền chi tiết theo từng bước nằm trong status-workflow.ts; guard ở đây chỉ
  // loại VIEWER ra khỏi mọi thao tác đổi trạng thái.
  @ApiOperation({ summary: 'Cập nhật trạng thái tờ khai theo quy trình duyệt' })
  @Roles('ADMIN', 'DIRECTOR', 'STAFF')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('note') note: string | undefined,
    @Request() req,
  ) {
    return this.customsService.updateStatus(id, status, req.user, note);
  }

  @ApiOperation({ summary: 'Xóa tờ khai' })
  @Roles('ADMIN', 'DIRECTOR')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.customsService.remove(id, req.user);
  }
}
