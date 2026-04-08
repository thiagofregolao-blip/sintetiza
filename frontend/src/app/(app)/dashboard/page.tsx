'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getDigests, getGroups, generateManualDigest } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Digest {
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
      messages?: { sender: string; text: string; timestamp: string }[];
    }[];
  };
  created_at: string;
}

interface Group {
  id: string;
  name: string;
  participant_count: number;
  message_count_today: number;
  is_monitored: boolean;
}

/* ------------------------------------------------------------------ */
/*  Mock / fallback data                                               */
/* ------------------------------------------------------------------ */

const mockDigest: Digest = {
  id: 'mock-1',
  type: 'daily',
  period_start: new Date().toISOString(),
  period_end: new Date().toISOString(),
  total_messages: 347,
  total_groups: 8,
  urgent_count: 2,
  mention_count: 5,
  content_json: {
    overall_summary:
      'Discussões intensas sobre lançamento do produto v2.0. Deploy agendado para sexta-feira. Equipe de QA reportou 3 bugs críticos.',
    urgent_items: [
      {
        group: 'Produto — Core Team',
        message: 'URGENTE: Falha no serviço de pagamento detectada em produção',
      },
    ],
    groups: [
      {
        name: 'Produto — Core Team',
        messages: [
          { sender: 'Carlos', text: 'Deploy v2.0 confirmado para sexta', timestamp: '09:32' },
          { sender: 'Ana', text: 'QA reportou 3 bugs críticos', timestamp: '10:15' },
          { sender: 'Rafael', text: 'Precisamos resolver antes do deploy', timestamp: '10:22' },
        ],
      },
      {
        name: 'Design Sprint',
        messages: [
          { sender: 'Juliana', text: 'Protótipos aprovados pelo cliente', timestamp: '11:00' },
        ],
      },
    ],
  },
  created_at: new Date().toISOString(),
};

const mockGroups: Group[] = [
  { id: '1', name: 'Produto — Core Team', participant_count: 12, message_count_today: 89, is_monitored: true },
  { id: '2', name: 'Design Sprint', participant_count: 6, message_count_today: 34, is_monitored: true },
  { id: '3', name: 'DevOps Alerts', participant_count: 8, message_count_today: 52, is_monitored: true },
  { id: '4', name: 'Marketing Q2', participant_count: 15, message_count_today: 27, is_monitored: true },
  { id: '5', name: 'RH — Geral', participant_count: 20, message_count_today: 18, is_monitored: true },
  { id: '6', name: 'Financeiro', participant_count: 5, message_count_today: 11, is_monitored: true },
];

const mockContacts = [
  { name: 'Carlos Mendes', initials: 'CM', color: '#4ff07f', time: '10:32', message: 'Pode revisar o PR #142?' },
  { name: 'Ana Beatriz', initials: 'AB', color: '#72d8c8', time: '09:45', message: 'Aprovei o orçamento' },
  { name: 'Rafael Lima', initials: 'RL', color: '#99e1d4', time: '08:20', message: 'Reunião remarcada para 15h' },
  { name: 'Juliana Costa', initials: 'JC', color: '#ffb4ab', time: 'Ontem', message: 'Enviei os mockups atualizados' },
];

const mockKeywords = [
  { id: '1', word: 'urgente', type: 'urgent' },
  { id: '2', word: 'deploy', type: 'deploy' },
  { id: '3', word: 'bug', type: 'bug' },
  { id: '4', word: 'produção', type: 'urgent' },
  { id: '5', word: 'aprovado', type: 'success' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function todayFormatted(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function keywordColor(type: string) {
  switch (type) {
    case 'urgent':
      return 'bg-red-500/10 text-red-400 border border-red-500/20';
    case 'deploy':
      return 'bg-[#4ff07f]/10 text-[#4ff07f] border border-[#4ff07f]/20';
    case 'bug':
      return 'bg-[#72d8c8]/10 text-[#72d8c8] border border-[#72d8c8]/20';
    case 'success':
      return 'bg-[#4ff07f]/10 text-[#4ff07f] border border-[#4ff07f]/20';
    default:
      return 'bg-[#2d3449] text-[#bbcbb9]';
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [digestsRes, groupsRes] = await Promise.allSettled([
          getDigests(),
          getGroups(),
        ]);

        const digestsData =
          digestsRes.status === 'fulfilled' && Array.isArray(digestsRes.value) && digestsRes.value.length > 0
            ? digestsRes.value
            : null;
        const groupsData =
          groupsRes.status === 'fulfilled' && Array.isArray(groupsRes.value) && groupsRes.value.length > 0
            ? groupsRes.value
            : null;

        setDigest(digestsData ? digestsData[0] : mockDigest);
        setGroups(groupsData || mockGroups);
      } catch {
        setDigest(mockDigest);
        setGroups(mockGroups);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleGenerateDigest() {
    setGenerating(true);
    try {
      await generateManualDigest({
        period_hours: 24,
        format: 'detailed',
        channels: ['dashboard'],
      });
      const digests = await getDigests();
      if (Array.isArray(digests) && digests.length > 0) {
        setDigest(digests[0]);
      }
    } catch {
      // silently fail
    } finally {
      setGenerating(false);
    }
  }

  const totalMessages = digest?.total_messages ?? 347;
  const activeGroups = groups.filter((g) => g.is_monitored).length || 8;
  const mentions = digest?.mention_count ?? 5;
  const urgentCount = digest?.urgent_count ?? 2;

  const stats = [
    {
      label: 'Mensagens hoje',
      value: totalMessages,
      change: '+12%',
      borderColor: 'border-l-[#4ff07f]',
      changeColor: 'text-[#4ff07f]',
    },
    {
      label: 'Grupos ativos',
      value: activeGroups,
      change: '',
      borderColor: 'border-l-[#72d8c8]',
      changeColor: '',
    },
    {
      label: 'Menções',
      value: mentions,
      change: '+3',
      borderColor: 'border-l-[#99e1d4]',
      changeColor: 'text-[#99e1d4]',
    },
    {
      label: 'Urgentes',
      value: urgentCount,
      change: urgentCount > 0 ? 'atenção' : '',
      borderColor: 'border-l-[#ffb4ab]',
      changeColor: 'text-[#ffb4ab]',
    },
  ];

  const urgentItems = digest?.content_json?.urgent_items ?? [];
  const timelineMessages = digest?.content_json?.groups?.[0]?.messages ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* ---- Stats header ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`bg-[#131b2e] rounded-xl p-5 border-l-4 ${s.borderColor}`}
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#bbcbb9] font-bold mb-2">
              {s.label}
            </p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-[#dae2fd]">{s.value}</span>
              {s.change && (
                <span className={`text-xs font-medium ${s.changeColor} mb-1`}>
                  {s.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Main grid ---- */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Daily summary */}
          <div className="bg-[#060e20] rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4ff07f] text-xl">
                  summarize
                </span>
                <h2 className="text-lg font-bold text-[#dae2fd]">
                  Resumo &mdash; {todayFormatted()}
                </h2>
              </div>
            </div>

            {/* Urgent banner */}
            {urgentItems.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-5 flex items-start gap-3">
                <span className="material-symbols-outlined text-[#ffb4ab] text-xl mt-0.5">
                  priority_high
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#ffb4ab] mb-1">
                    {urgentItems[0].group}
                  </p>
                  <p className="text-sm text-[#dae2fd]">{urgentItems[0].message}</p>
                  <Link
                    href={`/digest?id=${digest?.id || 'mock-1'}`}
                    className="text-xs text-[#ffb4ab] hover:underline mt-2 inline-block"
                  >
                    Ver Mensagem &rarr;
                  </Link>
                </div>
              </div>
            )}

            {/* Summary text */}
            {digest?.content_json?.overall_summary && (
              <p className="text-sm text-[#bbcbb9] leading-relaxed mb-5">
                {digest.content_json.overall_summary}
              </p>
            )}

            {/* Timeline items */}
            <div className="space-y-3 mb-6">
              {timelineMessages.map((msg, i) => (
                <div key={i} className="flex items-start gap-4">
                  <span className="text-[10px] text-[#bbcbb9] font-mono w-12 text-right flex-shrink-0 mt-1">
                    {msg.timestamp}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-[#4ff07f]">
                      {msg.sender}
                    </span>
                    <p className="text-sm text-[#dae2fd] mt-0.5">{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerateDigest}
              disabled={generating}
              className="w-full py-3 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#0b1326] border-t-transparent rounded-full animate-spin" />
                  Gerando...
                </span>
              ) : (
                'Gerar resumo agora'
              )}
            </button>
          </div>

          {/* Groups monitoring */}
          <div className="bg-[#060e20] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#72d8c8] text-xl">
                groups
              </span>
              <h2 className="text-lg font-bold text-[#dae2fd]">
                Monitoramento de Grupos
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {groups.slice(0, 6).map((group) => (
                <Link
                  key={group.id}
                  href={`/digest?id=${group.id}`}
                  className="block"
                >
                  <div className="bg-[#131b2e] p-4 rounded-xl border border-transparent hover:border-[#4ff07f]/20 transition-colors flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#2d3449] flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#4ff07f] text-lg">
                        groups
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[#dae2fd] truncate">
                        {group.name}
                      </h3>
                      <p className="text-xs text-[#bbcbb9]">
                        {group.message_count_today} mensagens
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 w-2 h-2 rounded-full ${
                        group.message_count_today > 40 ? 'bg-[#ffb4ab]' : 'bg-[#4ff07f]'
                      }`}
                    />
                    <span className="material-symbols-outlined text-[#bbcbb9] text-lg">
                      chevron_right
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-6">
          {/* Individual chats */}
          <div className="bg-[#060e20] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#99e1d4] text-xl">
                chat
              </span>
              <h2 className="text-lg font-bold text-[#dae2fd]">
                Conversas Diretas
              </h2>
            </div>

            <div className="space-y-3">
              {mockContacts.map((contact) => (
                <div
                  key={contact.name}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#131b2e] transition-colors cursor-pointer"
                >
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-[#0b1326]"
                    style={{ backgroundColor: contact.color }}
                  >
                    {contact.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[#dae2fd] truncate">
                        {contact.name}
                      </h3>
                      <span className="text-[10px] text-[#bbcbb9] flex-shrink-0 ml-2">
                        {contact.time}
                      </span>
                    </div>
                    <p className="text-xs text-[#bbcbb9] truncate mt-0.5">
                      {contact.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keyword alerts */}
          <div className="bg-[#060e20] rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#72d8c8] text-xl">
                  key
                </span>
                <h2 className="text-lg font-bold text-[#dae2fd]">
                  Alertas de Termos
                </h2>
              </div>
              <button className="text-[#4ff07f] hover:opacity-80 transition-opacity">
                <span className="material-symbols-outlined text-xl">
                  add_circle
                </span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {mockKeywords.map((kw) => (
                <span
                  key={kw.id}
                  className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full ${keywordColor(kw.type)}`}
                >
                  {kw.word}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
