'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { getDigest } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DigestData {
  id: string;
  type: string;
  period_start: string;
  period_end: string;
  total_messages: number;
  total_groups: number;
  urgent_count: number;
  mention_count: number;
  content_json?: {
    overall_summary?: string;
    urgent_items?: { group: string; message: string }[];
    groups?: {
      name: string;
      topic_tags?: string[];
      summary?: string;
      decisions?: string[];
      messages?: { sender: string; text: string; timestamp: string }[];
      mentions?: { sender: string; text: string; timestamp: string }[];
      suggested_reply?: string;
      activity?: { hour: string; count: number }[];
    }[];
  };
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const mockDigest: DigestData = {
  id: 'mock-1',
  type: 'daily',
  period_start: new Date().toISOString(),
  period_end: new Date().toISOString(),
  total_messages: 89,
  total_groups: 1,
  urgent_count: 1,
  mention_count: 3,
  content_json: {
    overall_summary:
      'O grupo discutiu extensamente o lançamento da v2.0, com foco no deploy agendado para sexta-feira. A equipe de QA identificou 3 bugs críticos que precisam ser resolvidos antes do go-live. Carlos confirmou o cronograma e Ana está liderando a triagem.',
    groups: [
      {
        name: 'Produto — Core Team',
        topic_tags: ['Deploy v2.0', 'Bugs Críticos', 'QA', 'Pagamentos'],
        summary:
          'O grupo discutiu extensamente o lançamento da v2.0. Carlos confirmou o deploy para sexta-feira. Ana reportou 3 bugs críticos encontrados pelo QA. Rafael destacou a necessidade de resolver todos antes do go-live.',
        decisions: [
          'Deploy v2.0 confirmado para sexta-feira às 22h',
          'Bugs críticos devem ser resolvidos até quinta-feira',
          'Juliana comunica cliente sobre timeline atualizada',
        ],
        mentions: [
          { sender: 'Carlos', text: '@você pode revisar o PR #142 antes do merge?', timestamp: '11:02' },
          { sender: 'Ana', text: '@você os testes do módulo de auth passaram?', timestamp: '14:30' },
          { sender: 'Rafael', text: '@você preciso do seu OK para o hotfix', timestamp: '16:15' },
        ],
        suggested_reply:
          'Oi Carlos! Vou revisar o PR #142 agora. Ana, sim — os testes de auth estão passando. Rafael, pode seguir com o hotfix, aprovado!',
        activity: [
          { hour: '08:00', count: 3 }, { hour: '09:00', count: 12 }, { hour: '10:00', count: 24 },
          { hour: '11:00', count: 18 }, { hour: '12:00', count: 5 }, { hour: '13:00', count: 2 },
          { hour: '14:00', count: 15 }, { hour: '15:00', count: 8 }, { hour: '16:00', count: 10 },
          { hour: '17:00', count: 6 }, { hour: '18:00', count: 4 },
        ],
      },
    ],
  },
  created_at: new Date().toISOString(),
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const namePattern = /\b(Carlos|Ana|Rafael|Juliana|@você)\b/g;

function highlightNames(text: string): React.ReactNode {
  const parts = text.split(namePattern);
  return parts.map((part, i) =>
    namePattern.test(part)
      ? <span key={i} className="text-[#4ff07f] font-semibold">{part}</span>
      : <span key={i}>{part}</span>
  );
}

const mentionBarColors = ['border-[#4ff07f]', 'border-[#72d8c8]', 'border-[#99e1d4]', 'border-[#ffb4ab]'];

/* ------------------------------------------------------------------ */
/*  Inner component (uses searchParams)                                */
/* ------------------------------------------------------------------ */

function DigestContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';

  const [digest, setDigest] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) { setDigest(mockDigest); setLoading(false); return; }
      try {
        const data = await getDigest(id);
        setDigest(data && data.id ? data : mockDigest);
      } catch {
        setDigest(mockDigest);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!digest) return null;

  const group = digest.content_json?.groups?.[0];
  const groupName = group?.name || 'Digest';
  const topicTags = group?.topic_tags ?? ['Geral'];
  const summary = group?.summary || digest.content_json?.overall_summary || '';
  const decisions = group?.decisions ?? [];
  const mentions = group?.mentions ?? [];
  const suggestedReply = group?.suggested_reply || '';
  const activity = group?.activity ?? [];
  const maxActivity = Math.max(...activity.map((a) => a.count), 1);
  const peakHour = activity.reduce((peak, a) => (a.count > peak.count ? a : peak), { hour: '', count: 0 });

  function handleCopy() {
    navigator.clipboard.writeText(suggestedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <nav className="flex items-center gap-2 text-sm text-[#bbcbb9]">
        <Link href="/dashboard" className="hover:text-[#dae2fd] transition-colors">Dashboard</Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-[#dae2fd]">{groupName}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4ff07f] to-[#25d366] flex items-center justify-center">
          <span className="material-symbols-outlined text-[#0b1326] text-3xl">groups</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-[#dae2fd]">{groupName}</h1>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full bg-[#4ff07f]/10 text-[#4ff07f] border border-[#4ff07f]/20">
              {digest.total_messages} mensagens hoje
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {topicTags.map((tag) => (
              <span key={tag} className="text-xs px-3 py-1 rounded-full bg-[#2d3449] text-[#bbcbb9]">{tag}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#3c4a3d]/30 text-[#dae2fd] hover:bg-[#131b2e] transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>Relatório PDF
          </button>
          <button className="px-4 py-2.5 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 transition-opacity flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">open_in_new</span>Ver Grupo
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-[#131b2e] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#4ff07f] text-xl">auto_awesome</span>
              <h2 className="text-lg font-bold text-[#dae2fd]">Resumo da Inteligência</h2>
            </div>
            <p className="text-sm text-[#dae2fd] leading-relaxed mb-6">{highlightNames(summary)}</p>
            {decisions.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-[0.2em] text-[#bbcbb9] font-bold mb-3">Decisões tomadas</h3>
                <div className="space-y-2">
                  {decisions.map((d, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[#4ff07f] text-lg mt-0.5">check_circle</span>
                      <p className="text-sm text-[#dae2fd]">{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#131b2e] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#72d8c8] text-xl">alternate_email</span>
              <h2 className="text-lg font-bold text-[#dae2fd]">Menções a você</h2>
            </div>
            <div className="space-y-4">
              {mentions.map((mention, i) => (
                <div key={i} className={`border-l-2 ${mentionBarColors[i % mentionBarColors.length]} pl-4`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-[#4ff07f]">{mention.sender}</span>
                    <span className="text-[10px] text-[#bbcbb9] px-2 py-0.5 rounded bg-[#2d3449]">{mention.timestamp}</span>
                  </div>
                  <div className="bg-[#060e20] rounded-lg p-3">
                    <p className="text-sm text-[#dae2fd]">{mention.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          {suggestedReply && (
            <div className="bg-gradient-to-br from-[#131b2e] to-[#171f33] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-[#4ff07f] text-xl">quick_phrases</span>
                <h2 className="text-lg font-bold text-[#dae2fd]">Resposta Sugerida</h2>
              </div>
              <div className="bg-[#060e20] rounded-lg p-4 mb-5">
                <p className="text-sm text-[#dae2fd] leading-relaxed">{suggestedReply}</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 transition-opacity">Responder</button>
                <button onClick={handleCopy} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#3c4a3d]/30 text-[#dae2fd] hover:bg-[#131b2e] transition-colors flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">content_copy</span>
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-[#131b2e] rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#72d8c8] text-xl">bar_chart</span>
                <h2 className="text-lg font-bold text-[#dae2fd]">Atividade</h2>
              </div>
              {peakHour.hour && (
                <span className="text-xs text-[#bbcbb9] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-[#ffb4ab]">local_fire_department</span>
                  Pico: {peakHour.hour}
                </span>
              )}
            </div>
            <div className="flex items-end gap-1.5 h-32">
              {activity.map((a) => {
                const height = (a.count / maxActivity) * 100;
                const isPeak = a.count === peakHour.count;
                return (
                  <div key={a.hour} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className={`w-full rounded-t-sm transition-all ${isPeak ? 'bg-[#ffb4ab]' : 'bg-[#4ff07f]/70'}`}
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${a.hour}: ${a.count} msgs`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-[#bbcbb9]">09:00</span>
              <span className="text-[10px] text-[#bbcbb9]">14:00</span>
              <span className="text-[10px] text-[#bbcbb9]">18:00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page wrapper with Suspense (required for useSearchParams)          */
/* ------------------------------------------------------------------ */

export default function DigestPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DigestContent />
    </Suspense>
  );
}
