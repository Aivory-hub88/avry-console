import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'console');
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB for testing
const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'text/markdown',
];

export async function POST(request: NextRequest) {
  console.log('[Upload Route] POST request received');

  try {
    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      console.log('[Upload Route] Creating upload directory:', UPLOAD_DIR);
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string;

    console.log('[Upload Route] FormData parsed:', { fileName, fileSize: file?.size, fileType: file?.type });

    // Validation
    if (!file) {
      console.error('[Upload Route] No file provided');
      return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    }

    console.log('[Upload Route] File validation:', { size: file.size, type: file.type, name: file.name });

    if (file.size > MAX_FILE_SIZE) {
      const msg = `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`;
      console.error('[Upload Route]', msg);
      return NextResponse.json({ message: msg }, { status: 413 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      const msg = `File type ${file.type} not allowed`;
      console.error('[Upload Route]', msg);
      return NextResponse.json({ message: msg }, { status: 415 });
    }

    // Generate unique file ID and sanitize filename
    const fileId = randomUUID();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = join(UPLOAD_DIR, `${fileId}_${sanitizedName}`);

    console.log('[Upload Route] Saving file:', { fileId, sanitizedName, storagePath });

    // Convert File to Buffer and write
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(storagePath, buffer);

    console.log('[Upload Route] File saved successfully');

    // Store metadata
    const metadata = {
      fileId,
      originalName: fileName,
      storageName: `${fileId}_${sanitizedName}`,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    };

    console.log('[Upload Route] Upload complete:', metadata);

    return NextResponse.json(
      {
        success: true,
        fileId,
        fileName: sanitizedName,
        size: file.size,
        message: 'File uploaded successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Upload Route] Error:', errorMsg, error);
    return NextResponse.json(
      { message: 'Upload failed', error: errorMsg },
      { status: 500 }
    );
  }
}

// GET endpoint to verify route exists
export async function GET(request: NextRequest) {
  console.log('[Upload Route] GET request received');
  return NextResponse.json(
    {
      status: 'ok',
      message: 'Upload endpoint is ready',
      maxSize: MAX_FILE_SIZE,
      allowedTypes: ALLOWED_TYPES,
    },
    { status: 200 }
  );
}
