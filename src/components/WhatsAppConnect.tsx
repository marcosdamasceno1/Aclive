import { useState, useEffect, useRef, useCallback } from 'react';
import { waStart, waStatus, waLogout } from '../lib/waGateway';
import { useCompanySettingsStore } from '../store/companySettingsStore';
import { MessageCircle, Loader2, CheckCircle, AlertTriangle, RefreshCw, Power } from 'lucide-react';

/**
 * WhatsAppConnect — conexão do WhatsApp da agência por QR Code, via gateway
 * central. O cliente só escaneia; nada de servidor ou chave. O status é
 * espelhado no companySettingsStore para o resto do app (Kanban, badge).
 */
export const WhatsAppConnect = () => {
  const setWaStatus = useCompanySettingsStore(s => s.setWaStatus);
  const status = useCompanySettingsStore(s => s.waStatus);

  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apply = useCallback((s: string | undefined, q: string | null | undefined, err: string | null) => {
    if (err) setError(err);
    if (s) setWaStatus(s);
    setQr(q ?? null);
  }, [setWaStatus]);

  const refresh = useCallback(async () => {
    const r = await waStatus();
    apply(r.status, r.qr, r.error);
  }, [apply]);

  // Status inicial + parada do polling ao desmontar
  useEffect(() => {
    refresh();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [refresh]);

  // Enquanto aguarda o scan, faz polling a cada 3s até conectar
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (status === 'SCAN_QR_CODE' || status === 'STARTING') {
      pollRef.current = setInterval(refresh, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, refresh]);

  const connect = async () => {
    setBusy(true); setError(null);
    const r = await waStart();
    apply(r.status, r.qr, r.error);
    setBusy(false);
  };

  const disconnect = async () => {
    setBusy(true); setError(null);
    const r = await waLogout();
    apply(r.status ?? 'STOPPED', null, r.error);
    setBusy(false);
  };

  const connected = status === 'WORKING';
  const scanning = status === 'SCAN_QR_CODE';

  return (
    <div className="bg-[#21262d] rounded-xl p-6 border border-white/[0.08] space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-100">WhatsApp</h3>
          <p className="text-xs text-slate-500">Conecte o número da sua agência escaneando o QR Code — como no WhatsApp Web.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">{error}</p>
        </div>
      )}

      {/* Conectado */}
      {connected && (
        <div className="flex items-center justify-between bg-green-500/[0.06] border border-green-500/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-sm font-semibold text-slate-100">Conectado</p>
              <p className="text-xs text-slate-500">Seu WhatsApp está recebendo e enviando pela plataforma.</p>
            </div>
          </div>
          <button onClick={disconnect} disabled={busy} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
            Desconectar
          </button>
        </div>
      )}

      {/* Escaneando */}
      {scanning && (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="bg-white rounded-xl p-3">
            {qr
              ? <img src={qr} alt="QR Code do WhatsApp" width={220} height={220} className="w-[220px] h-[220px]" />
              : <div className="w-[220px] h-[220px] flex items-center justify-center"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>}
          </div>
          <p className="text-xs text-slate-400 text-center max-w-xs">
            No celular: <strong className="text-slate-200">WhatsApp → Aparelhos conectados → Conectar um aparelho</strong> e aponte para este código.
          </p>
          <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar QR
          </button>
        </div>
      )}

      {/* Iniciando */}
      {status === 'STARTING' && !scanning && (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Iniciando sessão…
        </div>
      )}

      {/* Desconectado / desconhecido / falha */}
      {!connected && !scanning && status !== 'STARTING' && (
        <div className="space-y-3">
          {(status === 'FAILED' || status === 'UNREACHABLE') && (
            <p className="text-xs text-red-300">
              Não foi possível falar com o servidor de WhatsApp{status === 'UNREACHABLE' ? ' (fora do ar)' : ''}. Tente conectar novamente em instantes.
            </p>
          )}
          <button
            onClick={connect}
            disabled={busy}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            {busy ? 'Conectando…' : 'Conectar WhatsApp'}
          </button>
          <p className="text-xs text-slate-600">
            Ao conectar, o número passa a receber e responder mensagens pela aba Atendimento.
          </p>
        </div>
      )}
    </div>
  );
};
