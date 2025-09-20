import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateOfferDto {
  @IsUrl()
  @ApiProperty()
  link: string;

  @IsNumber()
  @ApiProperty()
  price: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional()
  footage?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional()
  rooms?: number;

  @IsDate()
  @ApiProperty()
  added_at: Date;

  @IsDate()
  @ApiProperty()
  udpated_at: Date;

  @IsOptional()
  @IsDate()
  @ApiPropertyOptional()
  valid_to?: Date;

  @IsString()
  @MaxLength(100)
  @ApiProperty()
  city: string;

  @IsString()
  @MaxLength(255)
  @ApiProperty()
  address: string;

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
