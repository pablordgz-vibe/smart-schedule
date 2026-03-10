"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const config_1 = require("@smart-schedule/config");
async function bootstrap() {
    const config = config_1.configService.all;
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    await app.listen(3002);
}
bootstrap();
//# sourceMappingURL=main.js.map