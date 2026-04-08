'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd] overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0b1326]/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="material-symbols-outlined text-2xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              bolt
            </span>
            <span className="text-xl font-bold bg-gradient-to-r from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              ZapDigest
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-[#bbcbb9] hover:text-[#dae2fd] transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-sm text-[#bbcbb9] hover:text-[#dae2fd] transition-colors">
              Pricing
            </a>
            <Link href="/auth/login" className="text-sm text-[#bbcbb9] hover:text-[#dae2fd] transition-colors">
              Login
            </Link>
            <Link
              href="/auth/register"
              className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] text-[#005523] hover:opacity-90 transition-opacity"
            >
              Começar grátis
            </Link>
          </nav>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden text-[#bbcbb9]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="material-symbols-outlined text-2xl">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#131b2e] border-t border-white/5 px-6 py-4 flex flex-col gap-4">
            <a href="#features" className="text-sm text-[#bbcbb9]" onClick={() => setMobileMenuOpen(false)}>
              Features
            </a>
            <a href="#pricing" className="text-sm text-[#bbcbb9]" onClick={() => setMobileMenuOpen(false)}>
              Pricing
            </a>
            <Link href="/auth/login" className="text-sm text-[#bbcbb9]" onClick={() => setMobileMenuOpen(false)}>
              Login
            </Link>
            <Link
              href="/auth/register"
              className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] text-[#005523] text-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              Começar grátis
            </Link>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 px-6">
        {/* Background effects */}
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#25d366]/10 rounded-full blur-[128px]" />

        <div className="relative max-w-7xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#131b2e] border border-[#222a3d] mb-8">
            <span className="w-2 h-2 rounded-full bg-[#4ff07f] animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-widest text-[#bbcbb9]">
              Inteligência Editorial para Líderes
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight mb-6">
            Seu WhatsApp.
            <br />
            <span className="bg-gradient-to-r from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              Resumido por IA.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="max-w-2xl mx-auto text-lg text-[#bbcbb9] mb-10">
            Monitore grupos, extraia insights e receba resumos inteligentes no horário que você escolher.
            Nunca mais perca uma informação importante.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link
              href="/auth/register"
              className="px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] text-[#005523] shadow-lg shadow-[#25d366]/25 hover:shadow-[#25d366]/40 transition-shadow"
            >
              Começar grátis
            </Link>
            <button className="px-8 py-4 text-base font-semibold rounded-xl border border-[#222a3d] text-[#dae2fd] hover:bg-[#131b2e] transition-colors">
              Ver demo
            </button>
          </div>

          {/* Dashboard Mockup */}
          <div className="relative max-w-4xl mx-auto">
            <div className="rounded-2xl bg-[#131b2e] border border-[#222a3d] p-8 shadow-2xl">
              <div className="glass-effect rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-[#4ff07f]">insights</span>
                  <span className="text-sm font-semibold text-[#dae2fd]">Insights do Dia</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#060e20] rounded-lg p-4">
                    <p className="text-xs text-[#bbcbb9] mb-1">Mensagens analisadas</p>
                    <p className="text-2xl font-bold text-[#4ff07f]">1.247</p>
                  </div>
                  <div className="bg-[#060e20] rounded-lg p-4">
                    <p className="text-xs text-[#bbcbb9] mb-1">Grupos monitorados</p>
                    <p className="text-2xl font-bold text-[#dae2fd]">12</p>
                  </div>
                  <div className="bg-[#060e20] rounded-lg p-4">
                    <p className="text-xs text-[#bbcbb9] mb-1">Alertas prioritários</p>
                    <p className="text-2xl font-bold text-[#ffb4ab]">3</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Potencialize sua produtividade
            </h2>
            <p className="text-[#bbcbb9] max-w-xl mx-auto">
              Ferramentas inteligentes que transformam o caos do WhatsApp em informação acionável.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="bg-[#131b2e] rounded-xl p-8 border border-[#222a3d]/50 hover:border-[#4ff07f]/20 transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-[#222a3d] flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[#4ff07f]">visibility</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Monitora tudo</h3>
              <p className="text-sm text-[#bbcbb9] leading-relaxed">
                Conecte seu WhatsApp e selecione quais grupos e conversas deseja monitorar. Tudo em tempo real.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-[#131b2e] rounded-xl p-8 border border-[#222a3d]/50 hover:border-[#4ff07f]/20 transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-[#222a3d] flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[#4ff07f]">psychology</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">IA que entende contexto</h3>
              <p className="text-sm text-[#bbcbb9] leading-relaxed">
                Algoritmos avançados que identificam temas, sentimentos e prioridades nas suas conversas.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-[#131b2e] rounded-xl p-8 border border-[#222a3d]/50 hover:border-[#4ff07f]/20 transition-all duration-300 hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-[#222a3d] flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[#4ff07f]">schedule</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">No horário certo</h3>
              <p className="text-sm text-[#bbcbb9] leading-relaxed">
                Receba seus resumos no momento ideal. Configure agendamentos personalizados para cada dia.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Investimento em Foco
            </h2>
            <p className="text-[#bbcbb9] max-w-xl mx-auto">
              Escolha o plano ideal para o seu nível de produtividade.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
            {/* Free */}
            <div className="bg-[#131b2e] rounded-xl p-8 border border-[#222a3d]/50">
              <h3 className="text-lg font-semibold mb-1">Free</h3>
              <p className="text-sm text-[#bbcbb9] mb-6">Para experimentar</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold">R$0</span>
                <span className="text-sm text-[#bbcbb9]">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {['1 grupo monitorado', 'Resumo diário', 'Últimas 24h de histórico'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#bbcbb9]">
                    <span className="material-symbols-outlined text-[#4ff07f] text-lg">check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className="block w-full py-3 text-center text-sm font-semibold rounded-xl border border-[#222a3d] text-[#dae2fd] hover:bg-[#222a3d] transition-colors"
              >
                Começar grátis
              </Link>
            </div>

            {/* Pro */}
            <div className="relative bg-[#131b2e] rounded-xl p-8 border-2 border-[#4ff07f]/40 scale-105 shadow-lg shadow-[#25d366]/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#4ff07f] to-[#25d366] text-xs font-bold text-[#005523]">
                Mais Popular
              </div>
              <h3 className="text-lg font-semibold mb-1">Pro</h3>
              <p className="text-sm text-[#bbcbb9] mb-6">Para profissionais</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold">R$29</span>
                <span className="text-sm text-[#bbcbb9]">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  '10 grupos monitorados',
                  'Resumos ilimitados',
                  'Palavras-chave e alertas',
                  'Histórico de 30 dias',
                  'Suporte prioritário',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#bbcbb9]">
                    <span className="material-symbols-outlined text-[#4ff07f] text-lg">check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className="block w-full py-3 text-center text-sm font-semibold rounded-xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] text-[#005523] hover:opacity-90 transition-opacity"
              >
                Assinar Pro
              </Link>
            </div>

            {/* Business */}
            <div className="bg-[#131b2e] rounded-xl p-8 border border-[#222a3d]/50">
              <h3 className="text-lg font-semibold mb-1">Business</h3>
              <p className="text-sm text-[#bbcbb9] mb-6">Para equipes</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold">R$79</span>
                <span className="text-sm text-[#bbcbb9]">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Grupos ilimitados',
                  'Múltiplos usuários',
                  'API de integração',
                  'Dashboard avançado',
                  'Relatórios exportáveis',
                  'SLA garantido',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#bbcbb9]">
                    <span className="material-symbols-outlined text-[#4ff07f] text-lg">check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className="block w-full py-3 text-center text-sm font-semibold rounded-xl border border-[#222a3d] text-[#dae2fd] hover:bg-[#222a3d] transition-colors"
              >
                Falar com vendas
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#222a3d]/50 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4ff07f]">bolt</span>
            <span className="text-sm text-[#bbcbb9]">
              &copy; {new Date().getFullYear()} ZapDigest. Todos os direitos reservados.
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-[#bbcbb9] hover:text-[#dae2fd] transition-colors">
              Privacidade
            </a>
            <a href="#" className="text-xs text-[#bbcbb9] hover:text-[#dae2fd] transition-colors">
              Termos
            </a>
            <a href="#" className="text-xs text-[#bbcbb9] hover:text-[#dae2fd] transition-colors">
              API
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
