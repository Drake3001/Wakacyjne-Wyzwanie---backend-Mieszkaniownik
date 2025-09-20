import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { RequestWithUser } from '../auth/dto/request-with-user.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RoleGuard } from '../auth/roles/role.guard';
import { Roles } from '../auth/roles/role.decorator';
import { Role } from '@prisma/client';
import { MatchingService } from './matching.service';

@ApiTags('matching')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('my-matches')
  @ApiOperation({ summary: 'Get all matches for current user' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of user matches' 
  })
  async getMyMatches(@Request() req: RequestWithUser) {
    return this.matchingService.getMatchesForUser(req.user!.id);
  }

  @Get('alert/:alertId/matches')
  @ApiOperation({ summary: 'Get matches for a specific alert' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of matches for the alert' 
  })
  async getAlertMatches(
    @Param('alertId', ParseIntPipe) alertId: number,
    @Request() req: RequestWithUser,
  ) {
    return this.matchingService.getMatchesForAlert(alertId, req.user!.id);
  }

  @Post('process-all-offers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process all offers for matching' })
  @ApiResponse({ 
    status: 200, 
    description: 'Started processing all offers' 
  })
  async processAllOffers() {
    this.matchingService.processAllOffers();
    return { message: 'Started processing all offers for matching' };
  }

  @Post('reprocess-alert/:alertId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reprocess matches for a specific alert' })
  @ApiResponse({ 
    status: 200, 
    description: 'Reprocessed matches for alert' 
  })
  async reprocessAlert(
    @Param('alertId', ParseIntPipe) alertId: number,
    @Request() req: RequestWithUser,
  ) {
    await this.matchingService.reprocessAlert(alertId);
    return { message: `Reprocessed matches for alert ${alertId}` };
  }
}
