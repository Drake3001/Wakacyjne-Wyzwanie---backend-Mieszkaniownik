import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ListingType } from '@prisma/client';

export class UpdateOfferDto {
  @IsOptional()
  @IsUrl()
  @ApiPropertyOptional()
  link?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  price?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional()
  footage?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional()
  rooms?: number;

  @IsOptional()
  @IsDate()
  @ApiPropertyOptional()
  added_at?: Date;

  @IsOptional()
  @IsDate()
  @ApiPropertyOptional()
  udpated_at?: Date;

  @IsOptional()
  @IsDate()
  @ApiPropertyOptional()
  valid_to?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional()
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiPropertyOptional()
  address?: string;

  @IsOptional()
  @IsEnum(ListingType)
  @ApiPropertyOptional({ enum: ListingType })
  type?: ListingType;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  furniture?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  negotiable?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  pets_allowed?: boolean;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional()
  floor?: number;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  elevator?: boolean;
}
