import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { loadS3IntoPinecone } from "@/lib/pinecone";
import { getS3Url } from "@/lib/s3";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// /api/create-chat
export async function POST(req: Request, res: Response) {
  try {
    console.log("Start of POST request handler");

    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      console.log("User not authenticated");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    console.log("User authenticated:", userId);

    // Parse request body
    const body = await req.json();
    const { file_key, file_name } = body;
    console.log("File key:", file_key);
    console.log("File name:", file_name);

    // Load S3 file into Pinecone
    console.log("Loading S3 file into Pinecone");
    await loadS3IntoPinecone(file_key);
    console.log("S3 file loaded into Pinecone successfully");

    // Insert data into database
    console.log("Inserting data into database");
    const chat_id = await db
      .insert(chats)
      .values({
        fileKey: file_key,
        pdfName: file_name,
        pdfUrl: getS3Url(file_key),
        userId,
      })
      .returning({
        insertedId: chats.id,
      });
    console.log("Data inserted into database. Chat ID:", chat_id[0].insertedId);

    // Send response
    console.log("Sending response");
    return NextResponse.json(
      {
        chat_id: chat_id[0].insertedId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
