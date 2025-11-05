import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
// import { PrismaService } from "./database/prisma/prisma.service";
import { Connection } from "mongoose";
import { MinioService } from "./database/minio/minio.service";

@Controller()
export class AppController {
    constructor(
        // private readonly prisma: PrismaService,
        private readonly minioService: MinioService,
        private readonly mongoConnection: Connection, // será injetada via provider
    ) {}

    @Get("health")
    async healthCheck(): Promise<{
        status: string;
        databases: Record<string, string>;
    }> {
        const results: Record<string, string> = {};

        // try {
        //     // 🪶 CockroachDB (Prisma)
        //     await this.prisma.$queryRaw`SELECT 1`;
        //     results["CockroachDB"] = "✅ Connected";
        // } catch (err) {
        //     results["CockroachDB"] = `❌ Failed: ${err.message}`;
        // }

        try {
            // 🍃 MongoDB (Mongoose)
            const mongoState = this.mongoConnection.readyState;
            // 1 = connected, 2 = connecting, 0 = disconnected
            if (mongoState === 1) {
                results["MongoDB"] = "✅ Connected";
            } else {
                results["MongoDB"] = `❌ Not connected (state: ${mongoState})`;
            }
        } catch (err) {
            results["MongoDB"] = `❌ Failed: ${err.message}`;
        }

        try {
            // 📦 MinIO
            // Testa a listagem de buckets como verificação de conexão
            await this.minioService["client"].listBuckets();
            results["MinIO"] = "✅ Connected";
        } catch (err) {
            results["MinIO"] = `❌ Failed: ${err.message}`;
        }

        const hasError = Object.values(results).some((msg) => msg.startsWith("❌"));
        if (hasError) {
            throw new HttpException({ status: "error", databases: results }, HttpStatus.SERVICE_UNAVAILABLE);
        }

        return { status: "success", databases: results };
    }
}
