import { Schema, Document } from "mongoose";

export interface Test extends Document {
    name: string;
    email: string;
}

export const TestSchema = new Schema<Test>({
    name: { type: String, required: true },
    email: { type: String, required: true },
});
