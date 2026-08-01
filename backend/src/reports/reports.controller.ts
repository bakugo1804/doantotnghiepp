import { Controller, Get, Post, Param, Res, UseGuards, Request, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { AiService } from '../ai/ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Reports - Báo cáo / Xuất file')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private reportsService: ReportsService,
    private aiService: AiService,
  ) {}

  @ApiOperation({ summary: 'Xuất tờ khai ra Excel' })
  @Get('excel/:id')
  async exportExcel(@Param('id') id: string, @Res() res: Response, @Request() req) {
    const buffer = await this.reportsService.exportToExcel(id, req.user);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="to-khai-${id}.xlsx"`,
    });
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Xuất tờ khai ra PDF' })
  @Get('pdf/:id')
  async exportPdf(@Param('id') id: string, @Res() res: Response, @Request() req) {
    const buffer = await this.reportsService.exportToPdf(id, req.user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="to-khai-${id}.pdf"`,
    });
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Tải mẫu Excel nhập liệu' })
  @Get('template')
  async getTemplate(@Res() res: Response) {
    const buffer = await this.reportsService.exportTemplateExcel();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mau-to-khai-hai-quan.xlsx"',
    });
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Tải mẫu PDF tờ khai' })
  @Get('template-pdf')
  async getTemplatePdf(@Res() res: Response) {
    const buffer = await this.reportsService.exportTemplatePdf();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="mau-to-khai-hai-quan.pdf"',
    });
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Chuyển đổi file Excel -> PDF' })
  @ApiConsumes('multipart/form-data')
  @Post('convert/excel-to-pdf')
  @UseInterceptors(FileInterceptor('file'))
  async excelToPdf(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    if (!file?.buffer) throw new BadRequestException('Không nhận được file');
    const parsed = await this.aiService.parseExcel(file.buffer);
    const buffer = await this.reportsService.parsedToPdf(parsed);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="to-khai-chuyen-doi.pdf"' });
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Chuyển đổi file PDF -> Excel' })
  @ApiConsumes('multipart/form-data')
  @Post('convert/pdf-to-excel')
  @UseInterceptors(FileInterceptor('file'))
  async pdfToExcel(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    if (!file?.buffer) throw new BadRequestException('Không nhận được file');
    const parsed = await this.aiService.parsePdf(file.buffer);
    const buffer = await this.reportsService.parsedToExcel(parsed);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="to-khai-chuyen-doi.xlsx"',
    });
    res.send(buffer);
  }
}
