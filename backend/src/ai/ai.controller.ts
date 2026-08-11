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

  /**
   * Đọc tờ khai từ ảnh chụp bản giấy đã điền tay.
   *
   * Ảnh chụp nặng hơn tệp Excel/PDF nhiều nên giới hạn kích thước ở đây, thay vì
   * để mô hình nhận cả tấm ảnh 20MB rồi chờ vô ích.
   */
  @ApiOperation({ summary: 'Upload ảnh chụp tờ khai giấy để đọc và trích xuất dữ liệu' })
  @ApiConsumes('multipart/form-data')
  @Post('parse-image')
  @UseInterceptors(FileInterceptor('file'))
  async parseImage(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('Không nhận được file');

    const mime = file.mimetype || '';
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) {
      throw new BadRequestException('Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP');
    }
    const maxBytes = 12 * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException('Ảnh quá lớn (giới hạn 12MB). Hãy chụp lại ở độ phân giải thấp hơn.');
    }
    return this.aiService.parseImage(file.buffer, mime);
  }

  @ApiOperation({ summary: 'Chat với AI hỗ trợ hải quan' })
  @Post('chat')
  async chat(@Body('message') message: string, @Request() req) {
    const reply = await this.aiService.chat(message, req.user.sub);
    return { reply };
  }
}
