import { Public } from '@common/decorator/public.decorator';
import { Controller, Headers, HttpCode, HttpStatus, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { SepayWebhookService } from './sepay-webhook.service';

/** Route công khai: danh tính được chứng minh bằng chữ ký HMAC của SePay, không bằng JWT */
@Public()
@ApiExcludeController()
@Controller('api/webhooks')
export class SepayWebhookController {
  constructor(private readonly webhookService: SepayWebhookService) {}

  // SePay chỉ coi là thành công khi HTTP 200/201 và body đúng `{"success": true}`
  @Post('sepay')
  @HttpCode(HttpStatus.OK)
  handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-sepay-signature') signature?: string,
    @Headers('x-sepay-timestamp') timestamp?: string,
  ) {
    return this.webhookService.handle({ rawBody: req.rawBody, signature, timestamp });
  }
}
