"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    common_1.Logger.log(`kestrel-cloud-api listening on ${port}`, 'Bootstrap');
}
void bootstrap();
//# sourceMappingURL=main.js.map