'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQRStream } from '@/lib/sse';
import { getToken } from '@/lib/api';

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3">
      {[1, 2, 3].map((step) => (
        <div
          key={step}
          className={`w-3 h-3 rounded-full transition-all ${
            step <= current
              ? 'bg-[#4ff07f] shadow-[0_0_10px_rgba(79,240,127,0.5)]'
              : 'bg-[#2d3449]'
          }`}
        />
      ))}
      <span className="ml-2 text-xs text-[#bbcbb9] font-medium tracking-wide">
        Step {String(current).padStart(2, '0')} / 03
      </span>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="w-full h-1 bg-[#222a3d] rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-[#4ff07f] to-[#25d366] rounded-full transition-all duration-500"
        style={{ width: `${(step / 3) * 100}%` }}
      />
    </div>
  );
}

export default function OnboardingConnectPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const qr = useQRStream(token);

  useEffect(() => {
    const t = getToken();
    if (t) setToken(t);
  }, []);

  useEffect(() => {
    if (qr.status === 'connected') {
      const timer = setTimeout(() => {
        router.push('/onboarding/groups');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [qr.status, router]);

  return (
    <div className="min-h-screen bg-[#0b1326] p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold bg-gradient-to-br from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              ZapDigest
            </h1>
            <span className="text-xs text-[#bbcbb9] bg-[#222a3d] px-2.5 py-1 rounded-full font-medium">
              Setup Wizard
            </span>
          </div>
          <StepDots current={1} />
        </div>
        <ProgressBar step={1} />
      </div>

      {/* Content grid */}
      <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-8">
        {/* Left column — QR */}
        <div className="lg:col-span-5 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-[#dae2fd] mb-2">
              Conecte seu WhatsApp
            </h2>
            <p className="text-sm text-[#bbcbb9] leading-relaxed">
              Escaneie o código QR abaixo com seu WhatsApp para autorizar o acesso
              aos seus grupos e mensagens.
            </p>
          </div>

          {/* QR Code area */}
          <div className="bg-[#131b2e] rounded-2xl border border-[#222a3d] p-6">
            <div className="flex items-center justify-center min-h-[280px]">
              {qr.status === 'connecting' && (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-[#bbcbb9]">Gerando código QR...</p>
                </div>
              )}

              {qr.status === 'waiting_scan' && qr.qrData && (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white rounded-xl p-4">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qr.qrData)}`}
                      alt="QR Code"
                      width={220}
                      height={220}
                      className="block"
                    />
                  </div>
                  <p className="text-xs text-[#bbcbb9]">
                    Abra o WhatsApp &gt; Dispositivos conectados &gt; Conectar dispositivo
                  </p>
                </div>
              )}

              {qr.status === 'connected' && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-full bg-[#4ff07f]/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#4ff07f] text-[32px]">
                      check_circle
                    </span>
                  </div>
                  <div>
                    <p className="text-[#4ff07f] font-semibold">Conectado com sucesso!</p>
                    {qr.displayName && (
                      <p className="text-sm text-[#bbcbb9] mt-1">{qr.displayName}</p>
                    )}
                    {qr.phone && (
                      <p className="text-xs text-[#bbcbb9]">{qr.phone}</p>
                    )}
                  </div>
                  <p className="text-xs text-[#bbcbb9]">Redirecionando...</p>
                </div>
              )}

              {qr.status === 'error' && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="material-symbols-outlined text-red-400 text-[32px]">
                    error
                  </span>
                  <p className="text-sm text-red-400">{qr.error || 'Erro ao conectar'}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-xs text-[#4ff07f] hover:underline"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {qr.status === 'timeout' && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="material-symbols-outlined text-yellow-400 text-[32px]">
                    timer_off
                  </span>
                  <p className="text-sm text-yellow-400">QR code expirou</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-xs text-[#4ff07f] hover:underline"
                  >
                    Gerar novo código
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Security card */}
          <div className="bg-[#131b2e] rounded-xl border border-[#222a3d] p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#222a3d] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#4ff07f] text-[20px]">
                  shield
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#dae2fd] mb-1">
                  Segurança em Primeiro Lugar
                </h3>
                <p className="text-xs text-[#bbcbb9] leading-relaxed">
                  Sua conexão é criptografada de ponta a ponta. Não armazenamos suas
                  credenciais do WhatsApp. Você pode desconectar a qualquer momento nas
                  configurações.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — Preview (disabled) */}
        <div className="lg:col-span-7 opacity-40 grayscale pointer-events-none select-none">
          <div className="space-y-6">
            {/* Step 2 Preview */}
            <div className="bg-[#131b2e] rounded-2xl border border-[#222a3d] p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-[#bbcbb9] text-[18px]">
                  groups
                </span>
                <h3 className="text-sm font-semibold text-[#dae2fd]">
                  Selecionar grupos
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {['Equipe Marketing', 'Devs Backend', 'Liderança', 'Vendas BR'].map(
                  (name) => (
                    <div
                      key={name}
                      className="bg-[#171f33] rounded-xl p-4 cursor-not-allowed"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#222a3d] flex items-center justify-center">
                          <span className="material-symbols-outlined text-[#bbcbb9] text-[16px]">
                            groups
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#dae2fd] font-medium truncate">
                            {name}
                          </p>
                          <p className="text-[10px] text-[#bbcbb9]">12 participantes</p>
                        </div>
                        <div className="w-9 h-5 bg-[#2d3449] rounded-full" />
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Step 3 Preview */}
            <div className="bg-[#131b2e] rounded-2xl border border-[#222a3d] p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-[#bbcbb9] text-[18px]">
                  schedule
                </span>
                <h3 className="text-sm font-semibold text-[#dae2fd]">
                  Configurar agendamento
                </h3>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-[#171f33] rounded-xl px-6 py-3">
                  <span className="text-2xl font-bold text-[#dae2fd] font-mono">
                    22:00
                  </span>
                </div>
                <p className="text-xs text-[#bbcbb9]">Resumo diário</p>
              </div>
              <div className="flex gap-2">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                      i === 0
                        ? 'bg-[#2d3449] text-[#bbcbb9]'
                        : 'bg-[#222a3d] text-[#dae2fd]'
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>
            </div>

            {/* Disabled button */}
            <button
              disabled
              className="w-full py-3 rounded-xl bg-[#2d3449] text-[#bbcbb9] text-sm font-semibold cursor-not-allowed"
            >
              Finalizar configuração
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
