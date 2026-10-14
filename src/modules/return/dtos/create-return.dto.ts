import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RETURN_REASONS } from '../return.constant';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ReturnItemDto {
  @ApiProperty({ description: 'ID dòng hàng của đơn (`items[].id` trong chi tiết đơn)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  orderItemId: string;

  @ApiProperty({ description: 'Số lượng muốn trả', example: 1 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}

export class CreateReturnDto {
  @ApiProperty({ description: 'Đơn đã giao và đã thanh toán' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  orderId: string;

  @ApiProperty({ enum: RETURN_REASONS })
  @IsString()
  @IsIn(RETURN_REASONS)
  reason: string;

  @ApiPropertyOptional({ description: 'Ghi chú cho cửa hàng', maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [ReturnItemDto], description: 'Các dòng hàng muốn trả; mỗi dòng chỉ xuất hiện một lần' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];
}
