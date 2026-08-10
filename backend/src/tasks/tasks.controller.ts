import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { TasksService } from './tasks.service';

@ApiTags('Tasks - Giao việc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @ApiOperation({ summary: 'Danh sách công việc' })
  @Get()
  findAll(
    @Request() req,
    @Query('date') date?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('status') status?: string,
    @Query('customsRecordId') customsRecordId?: string,
  ) {
    return this.tasksService.findAll(req.user.sub, req.user.role, req.user.companyId, {
      date,
      assignedToId,
      status,
      customsRecordId,
    });
  }

  @ApiOperation({ summary: 'Tạo công việc mới' })
  @Roles('ADMIN', 'DIRECTOR')
  @Post()
  create(@Body() body: any, @Request() req) {
    return this.tasksService.create(body, req.user.sub, req.user.companyId);
  }

  @ApiOperation({ summary: 'Cập nhật công việc' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req) {
    return this.tasksService.update(id, body, req.user.sub, req.user.role, req.user.companyId);
  }

  @ApiOperation({ summary: 'Xóa công việc' })
  @Roles('ADMIN', 'DIRECTOR')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.tasksService.remove(id, req.user.role, req.user.companyId);
  }
}