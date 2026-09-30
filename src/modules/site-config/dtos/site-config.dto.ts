import { ApiProperty } from '@nestjs/swagger';
import { IsJSON, IsNotEmpty } from 'class-validator';

export class UpsertSiteConfigDto {
  @ApiProperty({
    description: 'Stringified JSON value (thường là JSON.stringify của 1 mảng). FE tự JSON.parse theo `type`.',
    example: '[{"image":"https://.../banner1.jpg","title":"Summer 2026","href":"/shop"}]',
  })
  @IsJSON()
  @IsNotEmpty()
  value: string;
}
