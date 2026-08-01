import { Controller, Post, Body, UseGuards, Request, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('AI - Trí tuệ nhân tạo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @ApiOperation({ summary: 'Upload Excel để đọc và trích xuất dữ liệu tờ khai' })
  @ApiConsumes('multipart/form-data')
  @Post('parse-excel')
  @UseInterceptors(FileInterceptor('file'))
  async parseExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('Không nhận được file');
    return this.aiService.parseExcel(file.buffer);
  }

  @ApiOperation({ summary: 'Upload PDF để đọc và trích xuất dữ liệu tờ khai' })
  @ApiConsumes('multipart/form-data')
  @Post('parse-pdf')
  @UseInterceptors(FileInterceptor('file'))
  async parsePdf(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('Không nhận được file');
    return this.aiService.parsePdf(file.buffer);
  }

  @ApiOperation({ summary: 'Chat với AI hỗ trợ hải quan' })
  @Post('chat')
  async chat(@Body('message') message: string, @Request() req) {
    const reply = await this.aiService.chat(message, req.user.sub);
    return { reply };
  }
}
