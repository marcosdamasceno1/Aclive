// Google Identity Services + Drive API utilities

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
          }): { requestAccessToken(o?: { prompt?: string }): void };
          revoke(token: string, cb?: () => void): void;
        };
      };
    };
  }
}

const SCOPES = 'https://www.googleapis.com/auth/drive';

export function requestGoogleToken(
  clientId: string,
  onSuccess: (token: string, expiresIn: number) => void,
  onError: (msg: string) => void,
) {
  if (!window.google?.accounts?.oauth2) {
    onError('Google Identity Services não carregado. Aguarde e tente novamente.');
    return;
  }
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (r) => {
      if (r.error) { onError(`Erro OAuth: ${r.error}`); return; }
      if (r.access_token && r.expires_in) onSuccess(r.access_token, r.expires_in);
    },
  });
  client.requestAccessToken({ prompt: 'consent' });
}

/**
 * Tenta renovar o token silenciosamente (sem popup) usando a sessão Google ativa.
 * Funciona se o usuário já autorizou o app anteriormente e o cookie Google está válido.
 * Em caso de falha, chama onError com o motivo — sem exibir nenhuma UI ao usuário.
 */
export function requestGoogleTokenSilent(
  clientId: string,
  onSuccess: (token: string, expiresIn: number) => void,
  onError: (msg: string) => void,
) {
  if (!window.google?.accounts?.oauth2) {
    onError('gis_not_loaded');
    return;
  }
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (r) => {
      if (r.error) { onError(r.error); return; }
      if (r.access_token && r.expires_in) onSuccess(r.access_token, r.expires_in);
      else onError('no_token');
    },
  });
  // prompt: '' → usa sessão Google existente, sem popup.
  // Se não houver sessão/grant, dispara error 'interaction_required'.
  client.requestAccessToken({ prompt: '' });
}

export function revokeGoogleToken(token: string) {
  window.google?.accounts?.oauth2?.revoke(token);
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function driveRequest(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `Drive API ${res.status}`);
  }
  return res.json();
}

export async function listFiles(token: string, folderId = 'root'): Promise<DriveFile[]> {
  const q = `'${folderId}' in parents and trashed = false`;
  const data = await driveRequest(
    `files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=folder,name&pageSize=100`,
    token,
  );
  return (data.files || []) as DriveFile[];
}

export async function createFolder(token: string, name: string, parentId?: string): Promise<DriveFile> {
  const body: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId && parentId !== 'root') body.parents = [parentId];
  return driveRequest('files?fields=id,name,mimeType,modifiedTime', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function uploadFile(token: string, file: File, folderId?: string): Promise<DriveFile> {
  const meta: Record<string, unknown> = { name: file.name };
  if (folderId && folderId !== 'root') meta.parents = [folderId];
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  if (!res.ok) throw new Error(`Upload error ${res.status}`);
  return res.json();
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export const isFolder = (f: DriveFile) => f.mimeType === FOLDER_MIME;

export function driveFileUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function formatBytes(bytes?: string) {
  if (!bytes) return '';
  const b = parseInt(bytes, 10);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
