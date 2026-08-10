import { Body, Controller, Get, Patch, Post, Query, Request, UseGuards, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CompaniesService } from './companies.service';

@ApiTags('Companies - Danh bạ công ty')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @ApiOperation({ summary: 'Danh sách công ty' })
  @Get()
  findAll(@Query('search') search?: string, @Request() req?: any) {
    return this.companiesService.findAll(search, req.user);
  }

  @ApiOperation({ summary: 'Tạo công ty mới' })
  @Roles('ADMIN')
  @Post()
  create(@Body() body: any, @Request() req) {
    return this.companiesService.create(body, req.user.sub);
  }

  @ApiOperation({ summary: 'Cập nhật công ty' })
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req) {
    return this.companiesService.update(id, body, req.user.sub);
  }

  @ApiOperation({ summary: 'Xóa công ty' })
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }
}