import { MiddlewareConsumer, Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { ExtractHeaders } from "./utils/middlewares/extractHeaders.middleware";
// import { PrismaModule } from "./database/prisma/prisma.module";
import { MongoModule } from "./database/mongoose/mongoose.module";
import { MinioModule } from "./database/minio/minio.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: ["../.env", ".env"], // Carrega variáveis de ambiente da pasta mãe e da raiz
            isGlobal: true, // Torna o ConfigModule global
        }),

        ThrottlerModule.forRoot([
            {
                ttl: 1000,
                limit: 150,
            },
        ]),
        // PrismaModule,
        MongoModule,
        MinioModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(ExtractHeaders).forRoutes("*");
    }
}
