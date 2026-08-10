import { Controller, Get, Patch, Delete, Param, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

@ApiTags('Users - Quản lý người dùng')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @ApiOperation({ summary: 'Danh sách người dùng' })
  @Roles('ADMIN', 'DIRECTOR')
  @Get()
  findAll(@Request() req) {
    return this.usersService.findAll(req.user);
  }

  @ApiOperation({ summary: 'Chi tiết người dùng' })
  @Get('me')
  me(@Request() req) {
    return this.usersService.findOne(req.user.sub);
  }

  @ApiOperation({ summary: 'Cập nhật tài khoản hiện tại' })
  @Patch('me')
  updateMe(@Request() req, @Body() body: any) {
    return this.usersService.updateMe(req.user.sub, body);
  }

  @ApiOperation({ summary: 'Chi tiết người dùng' })
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const user = await this.usersService.findOne(id);
    if (req.user.role !== 'ADMIN' && user.id !== req.user.sub && user.companyId !== req.user.companyId) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin người dùng này');
    }
    return user;
  }

  @ApiOperation({ summary: 'Cập nhật người dùng' })
  @Roles('ADMIN', 'DIRECTOR')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req) {
    const user = req.user;
    if (user.role === 'ADMIN') {
      return this.usersService.update(id, body);
    }
    
    // For Director, we check company scope
    const targetUser = await this.usersService.findOne(id);
    if (targetUser.companyId !== user.companyId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa nhân viên này');
    }
    
    const updatedData = { ...body };
    delete updatedData.companyId; // Directors cannot change employee's company
    if (updatedData.role === 'ADMIN') {
      delete updatedData.role; // Directors cannot promote anyone to ADMIN
    }
    return this.usersService.update(id, updatedData);
  }

  @ApiOperation({ summary: 'Xóa người dùng' })
  @Roles('ADMIN', 'DIRECTOR')
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    const user = req.user;
    // Ràng buộc tự xoá và "quản trị viên cuối cùng" nằm trong service nên áp dụng
    // cho cả ADMIN, không riêng DIRECTOR như trước.
    if (user.role === 'ADMIN') {
      return this.usersService.remove(id, user.sub);
    }

    const targetUser = await this.usersService.findOne(id);
    if (targetUser.companyId !== user.companyId) {
      throw new ForbiddenException('Bạn không có quyền xóa nhân viên này');
    }
    return this.usersService.remove(id, user.sub);
  }
}
