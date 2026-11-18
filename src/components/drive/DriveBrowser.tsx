import { useState, useEffect, useRef } from 'react';
import {
  X, FolderOpen, Folder, Upload, FolderPlus, Trash2,
  ChevronRight, ExternalLink, Loader2, File as FileIcon, RefreshCw,
} from 'lucide-react';
import {
  listFiles, createFolder, uploadFile, deleteFile,
  isFolder, driveFileUrl, formatBytes,
  type DriveFile,
} from '../../lib/googleDrive';

interface Props {
  accessToken: string;
  onClose: () => void;
}

interface Crumb { id: string; name: string }

const MIME_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'image/': '🖼️',
  'video/': '🎬',
  'audio/': '🎵',
  'text/': '📝',
  'application/vnd.google-apps.document': '📝',
  'application/vnd.google-apps.spreadsheet': '📊',
  'application/vnd.google-apps.presentation': '📊',
};

function fileEmoji(f: DriveFile) {
  if (isFolder(f)) return null;
  for (const [prefix, emoji] of Object.entries(MIME_ICONS)) {
    if (f.mimeType.startsWith(prefix)) return emoji;
  }
  return '📎';
}

export const DriveBrowser = ({ accessToken, onClose }: Props) => {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: 'root', name: 'Meu Drive' }]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DriveFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentFolderId = crumbs[crumbs.length - 1].id;

  const load = async (folderId = currentFolderId) => {
    setLoading(true);
    setError('');
    try {
      const list = await listFiles(accessToken, folderId);
      setFiles(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentFolderId]);

  const openFolder = (f: DriveFile) =>
    setCrumbs(c => [...c, { id: f.id, name: f.name }]);

  const goToCrumb = (idx: number) =>
    setCrumbs(c => c.slice(0, idx + 1));

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const f = await createFolder(accessToken, newFolderName.trim(), currentFolderId);
      setFiles(prev => [f, ...prev]);
      setNewFolderName('');
      setShowNewFolder(false);
    } catch (e) { setError(String(e)); }
    finally { setCreatingFolder(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadFile(accessToken, file, currentFolderId);
      setFiles(prev => [...prev, uploaded]);
    } catch (e) { setError(String(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleDelete = async (f: DriveFile) => {
    try {
      await deleteFile(accessToken, f.id);
      setFiles(prev => prev.filter(x => x.id !== f.id));
    } catch (e) { setError(String(e)); }
    finally { setDeleteTarget(null); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-50 border border-slate-200 rounded-xl w-full max-w-2xl max-h-[85dvh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <div className="flex items-center gap-1 text-sm text-slate-700 min-w-0 overflow-x-auto">
              {crumbs.map((c, i) => (
                <span key={c.id} className="flex items-center gap-1 flex-shrink-0">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                  <button
                    onClick={() => goToCrumb(i)}
                    className={`hover:text-slate-900 transition-colors ${i === crumbs.length - 1 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200">
          <button
            onClick={() => setShowNewFolder(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Nova Pasta
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Enviando...' : 'Upload'}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
          <button onClick={() => load()} className="ml-auto p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Nome da pasta"
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleCreateFolder}
              disabled={creatingFolder || !newFolderName.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {creatingFolder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Criar'}
            </button>
            <button onClick={() => setShowNewFolder(false)} className="p-1.5 text-slate-500 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-600">
            {error}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">Pasta vazia</div>
          ) : (
            <div className="space-y-0.5">
              {files.map(f => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 group transition-colors"
                >
                  {isFolder(f) ? (
                    <button
                      onClick={() => openFolder(f)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <Folder className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-sm text-slate-800 truncate">{f.name}</span>
                    </button>
                  ) : (
                    <a
                      href={driveFileUrl(f.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <span className="text-base flex-shrink-0">{fileEmoji(f) ?? <FileIcon className="w-4 h-4 text-slate-500" />}</span>
                      <span className="text-sm text-slate-800 truncate">{f.name}</span>
                    </a>
                  )}
                  <div className="flex items-center gap-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {f.size && <span className="text-xs text-slate-500">{formatBytes(f.size)}</span>}
                    <span className="text-xs text-slate-400">{fmt(f.modifiedTime)}</span>
                    {!isFolder(f) && (
                      <a href={driveFileUrl(f.id)} target="_blank" rel="noopener noreferrer"
                        className="p-1 text-slate-500 hover:text-slate-700">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => setDeleteTarget(f)}
                      className="p-1 text-slate-500 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete confirm */}
        {deleteTarget && (
          <div className="border-t border-slate-200 px-5 py-4 bg-red-500/5">
            <p className="text-sm text-red-700 mb-3">
              Excluir <strong>"{deleteTarget.name}"</strong> do Drive?
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(deleteTarget)}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">
                Excluir
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 bg-slate-100 rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
