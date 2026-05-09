import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type HealthResponse = {
  environment: string;
  service: string;
  status: 'ok';
};

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHealth(): HealthResponse {
    return {
      environment: this.configService.get<string>('NODE_ENV') ?? 'development',
      service: 'kestrel-cloud-api',
      status: 'ok',
    };
  }
}
