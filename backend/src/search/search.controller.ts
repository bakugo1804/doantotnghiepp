import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SearchService } from './search.service';

@ApiTags('Search - Tìm kiếm toàn cục')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @ApiOperation({ summary: 'Tìm kiếm toàn cục' })
  @Get()
  search(
    @Query('q') query: string,
    @Query('status') status: string,
    @Query('transportType') transportType: string,
    @Query('only') only: string,
    @Request() req,
  ) {
    return this.searchService.globalSearch(
      query || '',
      req.user.role,
      req.user.sub,
      req.user.companyId,
      { status, transportType, only },
    );
  }
}