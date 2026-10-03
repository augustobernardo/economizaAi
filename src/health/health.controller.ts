import { Controller, Get } from '@nestjs/common';

interface HealthStatus {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  @Get()
  verificar(): HealthStatus {
    return { status: 'ok' };
  }
}
