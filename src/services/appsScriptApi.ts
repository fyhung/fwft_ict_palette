const endpoint = import.meta.env.VITE_APPS_SCRIPT_URL;

export interface ProbeUploadResult {
  operationId: string;
  main: { fileId: string; webContentLink?: string; resourceKey?: string; size: number };
  thumbnail: { fileId: string; webContentLink?: string; resourceKey?: string; size: number };
}

export interface PostUploadResult {
  postId: string;
  main: ProbeUploadResult["main"];
  thumbnail: ProbeUploadResult["thumbnail"];
}

export interface CommentUploadResult {
  commentId: string;
  main: ProbeUploadResult["main"];
  thumbnail: ProbeUploadResult["thumbnail"];
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

export async function uploadPostImage(
  idToken: string,
  classId: string,
  boardId: string,
  postId: string,
  main: Blob,
  thumbnail: Blob,
): Promise<PostUploadResult> {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "uploadPostImage",
      idToken,
      classId,
      boardId,
      postId,
      main: { mimeType: main.type, base64: await blobToBase64(main) },
      thumbnail: { mimeType: thumbnail.type, base64: await blobToBase64(thumbnail) },
    }),
  });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code ?? "APPS_SCRIPT_ERROR");
  return payload.data as PostUploadResult;
}

export async function deletePostFiles(
  idToken: string,
  classId: string,
  boardId: string,
  postId: string,
  fileIds: string[],
) {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "deletePostFiles",
      idToken,
      classId,
      boardId,
      postId,
      fileIds,
    }),
  });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code ?? "APPS_SCRIPT_ERROR");
  return payload.data as { postId: string; deleted: number };
}

export async function uploadCommentImage(
  idToken: string,
  classId: string,
  boardId: string,
  postId: string,
  commentId: string,
  main: Blob,
  thumbnail: Blob,
): Promise<CommentUploadResult> {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "uploadCommentImage", idToken, classId, boardId, postId, commentId,
      main: { mimeType: main.type, base64: await blobToBase64(main) },
      thumbnail: { mimeType: thumbnail.type, base64: await blobToBase64(thumbnail) },
    }),
  });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code ?? "APPS_SCRIPT_ERROR");
  return payload.data as CommentUploadResult;
}

export async function deletePostTreeFiles(idToken: string, classId: string, boardId: string, postId: string, fileIds: string[]) {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const response = await fetch(endpoint, {
    method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "deletePostTreeFiles", idToken, classId, boardId, postId, fileIds }),
  });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code ?? "APPS_SCRIPT_ERROR");
}

export async function deleteCommentFiles(
  idToken: string,
  classId: string,
  boardId: string,
  commentId: string,
  fileIds: string[],
) {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const response = await fetch(endpoint, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "deleteCommentFiles", idToken, classId, boardId, commentId, fileIds }),
  });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code ?? "APPS_SCRIPT_ERROR");
}

export async function deleteBoardFiles(idToken: string, classId: string, boardId: string) {
  if (!endpoint) throw new Error("APPS_SCRIPT_NOT_CONFIGURED");
  const response = await fetch(endpoint, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "deleteBoardFiles", idToken, classId, boardId }),
  });
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.code ?? "APPS_SCRIPT_ERROR");
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
