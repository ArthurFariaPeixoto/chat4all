import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ValidationError } from "class-validator";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    const swaggerConfig = new DocumentBuilder()
        .setTitle("Chat4All API")
        .setDescription("API de integração de sistemas de mensagens")
        .setVersion("1.0")
        .addBearerAuth(
            {
                type: "http",
                scheme: "bearer",
                bearerFormat: "jwt",
                name: "jwt",
                description: "Enter jwt token:",
                in: "header",
            },
            "token",
        )
        .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api", app, swaggerDocument);

    const extractErrors = (errors: ValidationError[]): string[] => {
        const errorMessages: string[] = [];
        errors.forEach((error) => {
            if (error.constraints) {
                errorMessages.push(...Object.values(error.constraints));
            }
            if (error.children && error.children.length > 0) {
                errorMessages.push(...extractErrors(error.children));
            }
        });
        return errorMessages;
    };

    app.useGlobalPipes(
        new ValidationPipe({
            exceptionFactory: (errors) => {
                const result = extractErrors(errors);
                return new BadRequestException(result);
            },
        }),
    );

    app.use(json({ limit: "80mb" }));
    app.use(urlencoded({ limit: "80mb", extended: true }));
    app.enableCors();
    await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
