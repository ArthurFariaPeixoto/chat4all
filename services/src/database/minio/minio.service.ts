import { Injectable, OnModuleInit } from "@nestjs/common";
import { Client } from "minio";

@Injectable()
export class MinioService implements OnModuleInit {
    private client: Client;

    onModuleInit() {
        if (process.env.MINIO_ENDPOINT === undefined) throw new Error("MINIO ENDPOINT not defined");
        this.client = new Client({
            endPoint: process.env.MINIO_ENDPOINT,
            port: Number(process.env.MINIO_PORT),
            useSSL: process.env.MINIO_SSL === "true",
            accessKey: process.env.MINIO_ACCESS_KEY,
            secretKey: process.env.MINIO_SECRET_KEY,
        });
    }

    async upload(bucket: string, objectName: string, buffer: Buffer, mimeType: string) {
        await this.client.putObject(bucket, objectName, buffer, buffer.length, { "Content-Type": mimeType });
        return `${process.env.MINIO_ENDPOINT}/${bucket}/${objectName}`;
    }

    async getObject(bucket: string, objectName: string) {
        return this.client.getObject(bucket, objectName);
    }

    async deleteObject(bucket: string, objectName: string) {
        await this.client.removeObject(bucket, objectName);
    }

    async ensureBucketExists(bucket: string) {
        const exists = await this.client.bucketExists(bucket);
        if (!exists) {
            await this.client.makeBucket(bucket, 'us-east-1');
        }
    }
}
