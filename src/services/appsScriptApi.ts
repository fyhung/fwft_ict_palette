const endpoint = import.meta.env.VITE_APPS_SCRIPT_URL;

export interface ProbeUploadResult {
  operationId: string;
  main: { fileId: string; webContentLink?: string; resourceKey?: string; size: number };
  thumbnail: { fileId: string; webContentLink?: string; resourceKey?: string; size: number };
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export async function probeAppsScriptHealth() {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const response = await fetch(`${endpoint}?action=healthCheck`, { redirect: "follow" });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  return response.json() as Promise<{ ok: boolean; version: string }>;
}

export async function uploadProbe(
  idToken: string,
  main: Blob,
  thumbnail: Blob,
): Promise<ProbeUploadResult> {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const operationId = crypto.randomUUID();
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "uploadProbe",
      idToken,
      operationId,
      main: { mimeType: main.type, base64: await blobToBase64(main) },
      thumbnail: { mimeType: thumbnail.type, base64: await blobToBase64(thumbnail) },
    }),
  });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code ?? "APPS_SCRIPT_ERROR");
  return payload.data as ProbeUploadResult;
}

export async function deleteProbe(
  idToken: string,
  operationId: string,
  fileIds: string[],
) {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "deleteProbe",
      idToken,
      operationId,
      fileIds,
    }),
  });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code ?? "APPS_SCRIPT_ERROR");
  return payload.data as { operationId: string; deleted: number };
}

export function driveMediaUrl(file: {
  fileId: string;
  resourceKey?: string;
}) {
  const query = new URLSearchParams({ id: file.fileId, sz: "w1000" });
  if (file.resourceKey) query.set("resourcekey", file.resourceKey);
  return `https://drive.google.com/thumbnail?${query.toString()}`;
}
