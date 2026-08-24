/** Extrai o ID de um link de compartilhamento do Google Drive. */
export const driveFileId = (url?: string): string | null => {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
};

/** URL de preview embutível (iframe) — funciona sem login se o arquivo estiver
 *  como "qualquer pessoa com o link pode ver". */
export const drivePreviewUrl = (url?: string): string | null => {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
};
