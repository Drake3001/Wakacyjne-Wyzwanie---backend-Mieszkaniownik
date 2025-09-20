import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUrl,
  Min,
  Max,
  IsNotEmpty,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Listing_type, NotificationMethod } from '@prisma/client';

export class CreateAlertDto {
  @ApiProperty({ description: 'Name for the alert' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Maximum price for the property' })
  @IsNumber()
  @Min(0)
  maxPrice: number;

  @ApiPropertyOptional({ description: 'Minimum price for the property' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiProperty({ description: 'City to search in' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiPropertyOptional({ description: 'District/neighborhood to search in' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional({ description: 'Number of rooms' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  rooms?: number;

  @ApiPropertyOptional({ description: 'Minimum footage in square meters' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  minFootage?: number;

  @ApiPropertyOptional({ description: 'Maximum footage in square meters' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  maxFootage?: number;

  @ApiPropertyOptional({ enum: Listing_type, description: 'Type of property' })
  @IsOptional()
  @IsEnum(Listing_type)
  type?: Listing_type;

  @ApiPropertyOptional({ description: 'Furniture required' })
  @IsOptional()
  @IsBoolean()
  furniture?: boolean;

  @ApiPropertyOptional({ description: 'Pets allowed' })
  @IsOptional()
  @IsBoolean()
  pets?: boolean;

  @ApiPropertyOptional({ description: 'Elevator required' })
  @IsOptional()
  @IsBoolean()
  elevator?: boolean;

  @ApiProperty({ 
    enum: NotificationMethod, 
    description: 'How to receive notifications',
    default: NotificationMethod.EMAIL 
  })
  @IsEnum(NotificationMethod)
  notificationMethod: NotificationMethod = NotificationMethod.EMAIL;

  @ApiPropertyOptional({ description: 'Discord webhook URL for notifications' })
  @IsOptional()
  @ValidateIf(o => o.notificationMethod === NotificationMethod.DISCORD || o.notificationMethod === NotificationMethod.BOTH)
  @IsUrl()
  discordWebhook?: string;
}
