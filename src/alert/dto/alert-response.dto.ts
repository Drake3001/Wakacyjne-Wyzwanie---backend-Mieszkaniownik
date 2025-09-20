import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Listing_type, NotificationMethod, AlertStatus } from '@prisma/client';

export class AlertResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  maxPrice: number;

  @ApiPropertyOptional()
  minPrice?: number;

  @ApiProperty()
  city: string;

  @ApiPropertyOptional()
  district?: string;

  @ApiPropertyOptional()
  rooms?: number;

  @ApiPropertyOptional()
  minFootage?: number;

  @ApiPropertyOptional()
  maxFootage?: number;

  @ApiPropertyOptional({ enum: Listing_type })
  type?: Listing_type;

  @ApiPropertyOptional()
  furniture?: boolean;

  @ApiPropertyOptional()
  pets?: boolean;

  @ApiPropertyOptional()
  elevator?: boolean;

  @ApiProperty({ enum: NotificationMethod })
  notificationMethod: NotificationMethod;

  @ApiPropertyOptional()
  discordWebhook?: string;

  @ApiProperty({ enum: AlertStatus })
  status: AlertStatus;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiPropertyOptional()
  matchesCount?: number;
}

export class AlertMatchDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  alertId: number;

  @ApiProperty()
  offerId: number;

  @ApiProperty()
  matchedAt: Date;

  @ApiProperty()
  notificationSent: boolean;
}

export class AlertWithMatchesDto extends AlertResponseDto {
  @ApiProperty({ type: [AlertMatchDto] })
  matches: AlertMatchDto[];
}
