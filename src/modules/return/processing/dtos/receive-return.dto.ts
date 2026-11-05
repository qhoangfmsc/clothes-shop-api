import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceivedItemDto {
  @ApiPropertyOptional({ description: 'ID dòng của yêu cầu trả hàng (`items[].id`)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  returnItemId: string;

  @ApiPropertyOptional({ description: 'Số lượng cửa hàng chấp nhận sau khi kiểm hàng (0 đến số khách xin trả)', example: 1 })
  @IsInt()
  @Min(0)
  @Max(1000)
  acceptedQuantity: number;
}

/** Cửa hàng đã nhận và kiểm hàng: chốt số lượng chấp nhận, từ đó hệ thống tạo yêu cầu hoàn tiền */
export class ReceiveReturnDto {
  @ApiPropertyOptional({
    type: [ReceivedItemDto],
    description: 'Số lượng chấp nhận từng dòng. Bỏ trống = chấp nhận đủ số khách xin trả. Dòng không nêu = chấp nhận đủ',
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceivedItemDto)
  items?: ReceivedItemDto[];

  @ApiPropertyOptional({
    description: 'Hoàn cả phí ship của đơn (mỗi đơn một lần; thường khi hàng lỗi hoặc giao sai). Mặc định false',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  refundShipping?: boolean;

  @ApiPropertyOptional({ description: 'Ghi chú cho khách (thay phản hồi trước đó nếu có)', maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
