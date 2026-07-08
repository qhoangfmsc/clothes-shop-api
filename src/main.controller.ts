import { Public } from '@common/decorator/public.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
@Public()
export class MainController {
  @Get()
  getHello(): string {
    return 'Clothes Shop API is running';
  }
}
