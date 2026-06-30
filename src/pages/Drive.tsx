import { useState, useEffect, useRef } from 'react';
import {
  FolderOpen, Folder, Upload, FolderPlus, Trash2,
  ChevronRight, ExternalLink, Loader2, File as FileIcon, RefreshCw,
  HardDrive, X, Link2, Link2Off, Settings as SettingsIcon, ShieldAlert,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  listFiles, createFolder, uploadFile, deleteFile,
  isFolder, driveFileUrl, formatBytes,
  type DriveFile,
} from '../lib/googleDrive';
import { useCompanySettingsStore } from '../store/companySettingsStore';
import { useAuthStore } from '../store/authStore';

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

interface Crumb { id: string; name: string }

export const Drive = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const {
    googleAccessToken, googleClientId, isConnected,
    minutesUntilExpiry, tryAutoRefresh, init,
  } = useCompanySettingsStore();

  const isAdmin = currentUser?.role === 'admin';

  // auto-refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const didAutoRefresh = useRef(false);

  // browser state
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

  useEffect(() => {
    init().then(() => {
      // After loading settings, if token is expired/missing, try silent refresh once
      const connected = useCompanySettingsStore.getState().isConnected();
      if (!connected && !didAutoRefresh.current) {
        didAutoRefresh.current = true;
        setRefreshing(true);
        useCompanySettingsStore.getState().tryAutoRefresh().then(ok => {
          setRefreshing(false);
          if (!ok) setRefreshFailed(true);
        });
      }
    });
  }, []);

  // Proactive refresh: if token expires in < 8 minutes, renew silently now
  useEffect(() => {
    if (!isConnected()) return;
    const mins = minutesUntilExpiry();
    if (mins > 0 && mins <= 8) {
      tryAutoRefresh(); // fire-and-forget, updates store + DB on success
    }
  }, [googleAccessToken]);

  const load = async (folderId = currentFolderId) => {
    if (!googleAccessToken) return;
    setLoading(true);
    setError('');
    try {
      setFiles(await listFiles(googleAccessToken, folderId));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected()) load();
  }, [currentFolderId, googleAccessToken]);

  const openFolder = (f: DriveFile) =>
    setCrumbs(c => [...c, { id: f.id, name: f.name }]);

  const goToCrumb = (idx: number) =>
    setCrumbs(c => c.slice(0, idx + 1));

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !googleAccessToken) return;
    setCreatingFolder(true);
    try {
      const f = await createFolder(googleAccessToken, newFolderName.trim(), currentFolderId);
      setFiles(prev => [f, ...prev]);
      setNewFolderName('');
      setShowNewFolder(false);
    } catch (e) { setError(String(e)); }
    finally { setCreatingFolder(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !googleAccessToken) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadFile(googleAccessToken, file, currentFolderId);
      setFiles(prev => [...prev, uploaded]);
    } catch (e) { setError(String(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleDelete = async (f: DriveFile) => {
    if (!googleAccessToken) return;
    try {
      await deleteFile(googleAccessToken, f.id);
      setFiles(prev => prev.filter(x => x.id !== f.id));
    } catch (e) { setError(String(e)); }
    finally { setDeleteTarget(null); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  /* ── not configured ── */
  if (!googleClientId && !refreshing) {
    return (
      <div className="space-y-6">
        <DriveHeader />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-5">
            <HardDrive className="w-7 h-7 text-blue-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-200 mb-2">Google Drive não configurado</h2>
          <p className="text-sm text-slate-500 max-w-sm mb-6">
            Configure o Client ID do Google Cloud nas Configurações para usar o Drive.
          </p>
          {isAdmin && (
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              <SettingsIcon className="w-4 h-4" />
              Ir para Configurações
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── trying silent refresh ── */
  if (refreshing) {
    return (
      <div className="space-y-6">
        <DriveHeader />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
          <p className="text-sm text-slate-400">Reconectando ao Drive…</p>
        </div>
      </div>
    );
  }

  /* ── token expired / not connected ── */
  if (!isConnected()) {
    if (isAdmin) {
      /* admin: can reconnect */
      return (
        <div className="space-y-6">
          <DriveHeader />
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 bg-slate-500/10 rounded-2xl flex items-center justify-center mb-5">
              <Link2Off className="w-7 h-7 text-slate-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-200 mb-2">Drive desconectado</h2>
            <p className="text-sm text-slate-500 max-w-sm mb-6">
              A sessão do Google Drive expirou. Reconecte nas Configurações para que toda a equipe volte a ter acesso.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setRefreshFailed(false);
                  setRefreshing(true);
                  tryAutoRefresh().then(ok => {
                    setRefreshing(false);
                    if (!ok) setRefreshFailed(true);
                  });
                }}
                className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar reconexão silenciosa
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                <Link2 className="w-4 h-4" />
                Reconectar no Settings
              </button>
            </div>
            {refreshFailed && (
              <p className="text-xs text-slate-600 mt-4 max-w-xs">
                Reconexão automática falhou. Use o botão acima para reconectar manualmente.
              </p>
            )}
          </div>
        </div>
      );
    }

    /* non-admin: cannot reconnect */
    return (
      <div className="space-y-6">
        <DriveHeader />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-5">
            <ShieldAlert className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-200 mb-2">Drive temporariamente indisponível</h2>
          <p className="text-sm text-slate-500 max-w-sm mb-3">
            O acesso ao Google Drive expirou. Solicite ao <strong className="text-slate-400">administrador</strong> que reconecte o Drive nas Configurações.
          </p>
          <p className="text-xs text-slate-600 max-w-xs">
            Após a reconexão, todos os usuários voltarão a ter acesso automaticamente.
          </p>
        </div>
      </div>
    );
  }

  /* ── connected: show browser ── */
  return (
    <div className="space-y-4">
      <DriveHeader />

      <div className="bg-[#161b22] border border-white/[0.08] rounded-xl flex flex-col min-h-[calc(100vh-220px)]">

        {/* Breadcrumb header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="flex items-center gap-1 text-sm text-slate-300 min-w-0 overflow-x-auto">
              {crumbs.map((c, i) => (
                <span key={c.id} className="flex items-center gap-1 flex-shrink-0">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                  <button
                    onClick={() => goToCrumb(i)}
                    className={`hover:text-white transition-colors ${i === crumbs.length - 1 ? 'text-white font-semibold' : 'text-slate-400'}`}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => load()}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg ml-3"
            title="Atualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.05]">
          <button
            onClick={() => setShowNewFolder(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Nova Pasta
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Enviando...' : 'Upload'}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />

          {/* Expiry hint for admins */}
          {isAdmin && (() => {
            const mins = minutesUntilExpiry();
            if (mins <= 15 && mins > 0) return (
              <span className="ml-auto text-xs text-amber-400/70">
                Sessão expira em ~{mins} min
              </span>
            );
            return null;
          })()}
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.05] bg-[#0d1117]">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Nome da pasta"
              className="flex-1 bg-[#21262d] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleCreateFolder}
              disabled={creatingFolder || !newFolderName.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {creatingFolder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Criar'}
            </button>
            <button onClick={() => setShowNewFolder(false)} className="p-1.5 text-slate-500 hover:text-slate-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-24 text-slate-500 text-sm">Pasta vazia</div>
          ) : (
            <div className="space-y-0.5">
              {files.map(f => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] group transition-colors"
                >
                  {isFolder(f) ? (
                    <button
                      onClick={() => openFolder(f)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span className="text-sm text-slate-200 truncate">{f.name}</span>
                    </button>
                  ) : (
                    <a
                      href={driveFileUrl(f.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <span className="text-base flex-shrink-0">{fileEmoji(f) ?? <FileIcon className="w-4 h-4 text-slate-500" />}</span>
                      <span className="text-sm text-slate-200 truncate">{f.name}</span>
                    </a>
                  )}
                  <div className="flex items-center gap-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {f.size && <span className="text-xs text-slate-500">{formatBytes(f.size)}</span>}
                    <span className="text-xs text-slate-600">{fmt(f.modifiedTime)}</span>
                    {!isFolder(f) && (
                      <a href={driveFileUrl(f.id)} target="_blank" rel="noopener noreferrer"
                        className="p-1 text-slate-500 hover:text-slate-300">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => setDeleteTarget(f)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
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
          <div className="border-t border-white/[0.08] px-5 py-4 bg-red-500/5">
            <p className="text-sm text-red-300 mb-3">
              Excluir <strong>"{deleteTarget.name}"</strong> do Drive?
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(deleteTarget)}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">
                Excluir
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-white/5 rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DriveHeader = () => (
  <div>
    <h1 className="text-3xl font-extrabold tracking-tight text-white">Drive</h1>
    <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Armazenamento de arquivos</p>
  </div>
);
