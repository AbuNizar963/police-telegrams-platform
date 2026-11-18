import { randomUUID } from "node:crypto";

type AppwriteConfig = {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
  storageBucketId: string;
};

function getConfig(): AppwriteConfig {
  const endpoint = (
    process.env.APPWRITE_ENDPOINT ?? "https://cloud.appwrite.io/v1"
  ).replace(/\\/+$/, "");
  const projectId = process.env.APPWRITE_PROJECT_ID?.trim() ?? "";
  const apiKey = process.env.APPWRITE_API_KEY?.trim() ?? "";
  const databaseId = process.env.APPWRITE_DATABASE_ID?.trim() ?? "";
  const storageBucketId = process.env.APPWRITE_STORAGE_BUCKET_ID?.trim() ?? "";

  if (!projectId || !apiKey || !databaseId || !storageBucketId) {
    throw new Error(
      "Appwrite configuration is incomplete. Set APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID and APPWRITE_STORAGE_BUCKET_ID."
    );
  }

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("APPWRITE_ENDPOINT must be a valid absolute URL.");
  }

  if (
    parsedEndpoint.protocol !== "https:" &&
    parsedEndpoint.hostname !== "localhost"
  ) {
    throw new Error("APPWRITE_ENDPOINT must use HTTPS outside localhost.");
  }

  return { endpoint, projectId, apiKey, databaseId, storageBucketId };
}

function appwriteHeaders(config: AppwriteConfig): Headers {
  return new Headers({
    "X-Appwrite-Project": config.projectId,
    "X-Appwrite-Key": config.apiKey,
    Accept: "application/json",
  });
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;

  try {
    const payload = JSON.parse(text) as { message?: unknown; type?: unknown };
    return typeof payload.message === "string"
      ? payload.message
      : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const config = getConfig();
  const headers = appwriteHeaders(config);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${config.endpoint}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `Appwrite request failed (${response.status}): ${await readError(response)}`
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function encodePath(value: string): string {
  if (!value.trim()) {
    throw new Error("Appwrite resource identifier is required.");
  }
  return encodeURIComponent(value);
}

function queryPath(queries: string[] = []): string {
  const params = new URLSearchParams();
  for (const query of queries) params.append("queries[]", query);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export type AppwriteRow<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  $permissions?: string[];
  [key: string]: unknown;
} & T;

export async function appwriteListRows<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  tableId: string,
  queries: string[] = []
): Promise<{ total: number; rows: AppwriteRow<T>[] }> {
  const config = getConfig();
  return requestJson<{ total: number; rows: AppwriteRow<T>[] }>(
    `/tablesdb/${encodePath(config.databaseId)}/tables/${encodePath(tableId)}/rows${queryPath(queries)}`
  );
}

export async function appwriteGetRow<
  T extends Record<string, unknown> = Record<string, unknown>,
>(tableId: string, rowId: string): Promise<AppwriteRow<T>> {
  const config = getConfig();
  return requestJson<AppwriteRow<T>>(
    `/tablesdb/${encodePath(config.databaseId)}/tables/${encodePath(tableId)}/rows/${encodePath(rowId)}`
  );
}

export async function appwriteCreateRow<T extends Record<string, unknown>>(
  tableId: string,
  data: T,
  options: { rowId?: string; permissions?: string[] } = {}
): Promise<AppwriteRow<T>> {
  const config = getConfig();
  return requestJson<AppwriteRow<T>>(
    `/tablesdb/${encodePath(config.databaseId)}/tables/${encodePath(tableId)}/rows`,
    {
      method: "POST",
      body: JSON.stringify({
        rowId: options.rowId ?? randomUUID(),
        data,
        ...(options.permissions ? { permissions: options.permissions } : {}),
      }),
    }
  );
}

export async function appwriteUpdateRow<T extends Record<string, unknown>>(
  tableId: string,
  rowId: string,
  data: Partial<T>
): Promise<AppwriteRow<T>> {
  const config = getConfig();
  return requestJson<AppwriteRow<T>>(
    `/tablesdb/${encodePath(config.databaseId)}/tables/${encodePath(tableId)}/rows/${encodePath(rowId)}`,
    { method: "PATCH", body: JSON.stringify({ data }) }
  );
}

export async function appwriteDeleteRow(
  tableId: string,
  rowId: string
): Promise<void> {
  const config = getConfig();
  await requestJson<void>(
    `/tablesdb/${encodePath(config.databaseId)}/tables/${encodePath(tableId)}/rows/${encodePath(rowId)}`,
    { method: "DELETE" }
  );
}

export async function appwriteUploadFile(input: {
  bytes: Buffer | Uint8Array;
  fileName: string;
  contentType: string;
  fileId?: string;
}): Promise<{
  $id: string;
  name: string;
  mimeType: string;
  sizeOriginal: number;
}> {
  const config = getConfig();
  const form = new FormData();
  const safeName = input.fileName
    .trim()
    .replace(/[\\\\/]+/g, "_")
    .slice(0, 180);

  if (!safeName) throw new Error("A valid file name is required.");

  form.append("fileId", input.fileId ?? randomUUID());
  form.append(
    "file",
    new Blob([Buffer.from(input.bytes)], { type: input.contentType }),
    safeName
  );

  return requestJson<{
    $id: string;
    name: string;
    mimeType: string;
    sizeOriginal: number;
  }>(`/storage/buckets/${encodePath(config.storageBucketId)}/files`, {
    method: "POST",
    body: form,
  });
}

export async function appwriteDownloadFile(fileId: string): Promise<{
  body: Buffer;
  contentType: string;
}> {
  const config = getConfig();
  const response = await fetch(
    `${config.endpoint}/storage/buckets/${encodePath(config.storageBucketId)}/files/${encodePath(fileId)}/download`,
    { headers: appwriteHeaders(config) }
  );

  if (!response.ok) {
    throw new Error(
      `Appwrite file download failed (${response.status}): ${await readError(response)}`
    );
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
  };
}

export async function appwriteDeleteFile(fileId: string): Promise<void> {
  const config = getConfig();
  await requestJson<void>(
    `/storage/buckets/${encodePath(config.storageBucketId)}/files/${encodePath(fileId)}`,
    { method: "DELETE" }
  );
}
