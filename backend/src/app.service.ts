import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ServiceInfoResponse = {
  environment: string;
  phase: 'bootstrap';
  service: string;
};

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getServiceInfo(): ServiceInfoResponse {
    return {
      environment: this.configService.get<string>('NODE_ENV') ?? 'development',
      phase: 'bootstrap',
      service: 'kestrel-cloud-api',
    };
  }
}
