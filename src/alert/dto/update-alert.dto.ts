import { PartialType } from '@nestjs/swagger';
import { CreateAlertDto } from './create-alert.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AlertStatus } from '@prisma/client';

export class UpdateAlertDto extends PartialType(CreateAlertDto) {
  @ApiPropertyOptional({ enum: AlertStatus, description: 'Alert status' })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;
}
