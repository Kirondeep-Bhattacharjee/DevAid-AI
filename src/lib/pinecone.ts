import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";
import { downloadFromS3 } from "./s3-server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import md5 from "md5";
import {
  Document,
  RecursiveCharacterTextSplitter,
} from "@pinecone-database/doc-splitter";
import { getEmbeddings } from "./embeddings";
import { convertToAscii } from "./utils";

// Function to initialize the Pinecone client with your API key
export const getPineconeClient = () => {
  return new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });
};

type PDFPage = {
  pageContent: string;
  metadata: {
    loc: { pageNumber: number };
  };
};

// Function to load data from S3 into Pinecone serverless index
export async function loadS3IntoPinecone(fileKey: string) {
  // 1. Download and read PDF from S3
  console.log("Downloading from S3 into file system");
  const fileName = await downloadFromS3(fileKey);
  if (!fileName) {
    throw new Error("Could not download from S3");
  }
  console.log("Loading PDF into memory: " + fileName);
  const loader = new PDFLoader(fileName);
  const pages = (await loader.load()) as PDFPage[];

  // 2. Split and segment the PDF
  const documents = await Promise.all(pages.map(prepareDocument));

  // 3. Vectorize and embed individual documents
  const vectors = await Promise.all(documents.flat().map(embedDocument));

  // 4. Upload to Pinecone serverless index
  const client = await getPineconeClient();
  const pineconeIndex = await client.index("devaid"); // Update index name
  const namespace = pineconeIndex.namespace(convertToAscii(fileKey));

  console.log("Inserting vectors into Pinecone serverless index");
  await namespace.upsert(vectors);

  return documents[0];
}

// Function to embed document content and metadata into Pinecone format
async function embedDocument(doc: Document) {
  try {
    const embeddings = await getEmbeddings(doc.pageContent);
    const hash = md5(doc.pageContent);

    return {
      id: hash,
      values: embeddings,
      metadata: {
        text: doc.metadata.text,
        pageNumber: doc.metadata.pageNumber,
      },
    } as PineconeRecord;
  } catch (error) {
    console.log("Error embedding document", error);
    throw error;
  }
}

// Function to truncate string by bytes
export const truncateStringByBytes = (str: string, bytes: number) => {
  const enc = new TextEncoder();
  return new TextDecoder("utf-8").decode(enc.encode(str).slice(0, bytes));
};

// Function to prepare document by splitting into segments
async function prepareDocument(page: PDFPage) {
  let { pageContent, metadata } = page;
  pageContent = pageContent.replace(/\n/g, "");
  // Split the docs
  const splitter = new RecursiveCharacterTextSplitter();
  const docs = await splitter.splitDocuments([
    new Document({
      pageContent,
      metadata: {
        pageNumber: metadata.loc.pageNumber,
        text: truncateStringByBytes(pageContent, 36000),
      },
    }),
  ]);
  return docs;
}
