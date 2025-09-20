import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { RequestWithUser } from '../auth/dto/request-with-user.dto';
import { AlertService } from './alert.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { AlertResponseDto, AlertWithMatchesDto } from './dto/alert-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new alert' })
  @ApiResponse({ 
    status: 201, 
    description: 'Alert created successfully',
    type: AlertResponseDto 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid input data' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  async create(
    @Body() createAlertDto: CreateAlertDto,
    @Request() req: RequestWithUser,
  ): Promise<AlertResponseDto> {
    return this.alertService.create(req.user!.id, createAlertDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all alerts for the current user' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of user alerts',
    type: [AlertResponseDto] 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  async findAll(@Request() req: RequestWithUser): Promise<AlertResponseDto[]> {
    return this.alertService.findAllByUser(req.user!.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific alert by ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Alert details',
    type: AlertResponseDto 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Alert not found' 
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ): Promise<AlertResponseDto> {
    return this.alertService.findOne(id, req.user!.id);
  }

  @Get(':id/matches')
  @ApiOperation({ summary: 'Get alert with its matched offers' })
  @ApiResponse({ 
    status: 200, 
    description: 'Alert with matches',
    type: AlertWithMatchesDto 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Alert not found' 
  })
  async findOneWithMatches(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ): Promise<AlertWithMatchesDto> {
    return this.alertService.findOneWithMatches(id, req.user!.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an alert' })
  @ApiResponse({ 
    status: 200, 
    description: 'Alert updated successfully',
    type: AlertResponseDto 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid input data' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Alert not found' 
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAlertDto: UpdateAlertDto,
    @Request() req: RequestWithUser,
  ): Promise<AlertResponseDto> {
    return this.alertService.update(id, req.user!.id, updateAlertDto);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause an alert' })
  @ApiResponse({ 
    status: 200, 
    description: 'Alert paused successfully',
    type: AlertResponseDto 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Alert not found' 
  })
  async pause(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ): Promise<AlertResponseDto> {
    return this.alertService.pauseAlert(id, req.user!.id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused alert' })
  @ApiResponse({ 
    status: 200, 
    description: 'Alert resumed successfully',
    type: AlertResponseDto 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Alert not found' 
  })
  async resume(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ): Promise<AlertResponseDto> {
    return this.alertService.resumeAlert(id, req.user!.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an alert' })
  @ApiResponse({ 
    status: 204, 
    description: 'Alert deleted successfully' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Alert not found' 
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
  ): Promise<void> {
    return this.alertService.remove(id, req.user!.id);
  }
}
