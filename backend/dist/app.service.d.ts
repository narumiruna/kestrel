import { ConfigService } from '@nestjs/config';
type HealthResponse = {
    environment: string;
    service: string;
    status: 'ok';
};
export declare class AppService {
    private readonly configService;
    constructor(configService: ConfigService);
    getHealth(): HealthResponse;
}
export {};
